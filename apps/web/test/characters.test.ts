import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@fabrica/db";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as list, POST as create } from "@/app/api/characters/route";
import { DELETE as remove, PATCH as patch } from "@/app/api/characters/[id]/route";
import { GET as schedule } from "@/app/api/characters/[id]/schedule/route";
import { POST as block } from "@/app/api/characters/[id]/block/route";
import { DELETE as unblock } from "@/app/api/characters/[id]/block/[blockId]/route";
import { ADMIN, ATENDENTE, cookiesOf, ctx, req, resetDb } from "./helpers";

const session = async (c: { email: string; password: string }) =>
  cookiesOf(await login(req("/api/auth/login", { method: "POST", body: c }), ctx)).fm_access!;

let admin: string;
let att: string;
let charId: string;

beforeEach(async () => {
  await resetDb();
  admin = await session(ADMIN);
  att = await session(ATENDENTE);
  const res = await create(
    req("/api/characters", { method: "POST", body: { name: "Drácula Clássico", pricePer2h: 45000, priceExtraHour: 18000 }, cookies: { fm_access: admin } }),
    ctx,
  );
  charId = (await res.json()).character.id;
});

const doBlock = (body: unknown, token = att) =>
  block(req(`/api/characters/${charId}/block`, { method: "POST", body, cookies: { fm_access: token } }), { params: { id: charId } });

describe("RF03 / RF10 - personagens vivos", () => {
  it("cadastro só pelo dono; lista pública mostra só ativos", async () => {
    const denied = await create(
      req("/api/characters", { method: "POST", body: { name: "Bruxa", pricePer2h: 1, priceExtraHour: 1 }, cookies: { fm_access: att } }),
      ctx,
    );
    expect(denied.status).toBe(403);

    await patch(req(`/api/characters/${charId}`, { method: "PATCH", body: { active: false }, cookies: { fm_access: admin } }), { params: { id: charId } });
    expect((await (await list(req("/api/characters"), ctx)).json()).items).toHaveLength(0);
    expect((await (await list(req("/api/characters?all=1", { cookies: { fm_access: admin } }), ctx)).json()).items).toHaveLength(1);
  });

  it("RN03: bloqueio não pode sobrepor outro horário", async () => {
    expect((await doBlock({ startsAt: "2026-10-31T18:00:00Z", endsAt: "2026-10-31T20:00:00Z", note: "Festa externa" })).status).toBe(201);
    expect((await doBlock({ startsAt: "2026-10-31T19:00:00Z", endsAt: "2026-10-31T21:00:00Z" })).status).toBe(409);
    expect((await doBlock({ startsAt: "2026-10-31T17:00:00Z", endsAt: "2026-10-31T18:30:00Z" })).status).toBe(409);
    // Encostado é permitido.
    expect((await doBlock({ startsAt: "2026-10-31T20:00:00Z", endsAt: "2026-10-31T22:00:00Z" })).status).toBe(201);
    expect((await doBlock({ startsAt: "2026-10-31T22:00:00Z", endsAt: "2026-10-31T21:00:00Z" })).status).toBe(400);
  });

  it("dois bloqueios simultâneos no mesmo horário: só um passa", async () => {
    const body = { startsAt: "2026-11-01T18:00:00Z", endsAt: "2026-11-01T20:00:00Z" };
    const results = await Promise.all([doBlock(body), doBlock(body), doBlock(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.characterSchedule.count()).toBe(1);
  });

  it("agenda lista e o bloqueio pode ser removido; cliente não vê agenda", async () => {
    const { block: b } = await (await doBlock({ startsAt: "2026-11-02T18:00:00Z", endsAt: "2026-11-02T20:00:00Z" })).json();
    const s = await schedule(
      req(`/api/characters/${charId}/schedule?from=2026-11-01T00:00:00Z&to=2026-11-03T00:00:00Z`, { cookies: { fm_access: att } }),
      { params: { id: charId } },
    );
    expect((await s.json()).items).toHaveLength(1);
    expect((await schedule(req(`/api/characters/${charId}/schedule`), { params: { id: charId } })).status).toBe(401);

    const del = await unblock(req(`/api/characters/${charId}/block/${b.id}`, { method: "DELETE", cookies: { fm_access: att } }), {
      params: { id: charId, blockId: b.id },
    });
    expect(del.status).toBe(200);
    expect(await prisma.characterSchedule.count()).toBe(0);
  });

  it("exclusão lógica pelo dono", async () => {
    const res = await remove(req(`/api/characters/${charId}`, { method: "DELETE", cookies: { fm_access: admin } }), { params: { id: charId } });
    expect(res.status).toBe(200);
    expect((await prisma.liveCharacter.findUniqueOrThrow({ where: { id: charId } })).deletedAt).not.toBeNull();
  });
});
