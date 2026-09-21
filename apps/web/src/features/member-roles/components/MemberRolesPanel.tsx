import type { MemberRole, MemberRolesPage, RoleMember } from '@rcl/contracts';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/components/AuthProvider.js';
import { changeMemberRole, getRoleMembers } from '../api/member-roles-api.js';
import './member-roles.css';

export function MemberRolesPanel() {
  const { state, retry: refreshSession } = useAuth();
  const canManage = state.status === 'authenticated' && state.user.role === 'owner';
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<MemberRolesPage | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [change, setChange] = useState<{ member: RoleMember; role: MemberRole } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision explicitly refreshes the list.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPage(null);
    setError('');
    const timer = window.setTimeout(() => {
      getRoleMembers(search, offset, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setPage(result);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setError(
              error instanceof Error ? error.message : 'No se pudieron cargar los miembros.'
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, offset, revision]);
  async function saveRole() {
    if (!change || !canManage || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await changeMemberRole(change.member.discordId, {
        role: change.role,
        expectedRole: change.member.role
      });
      setNotice(`Rol de ${change.member.username} actualizado a ${change.role}.`);
      setChange(null);
      setRevision((value) => value + 1);
      if (state.status === 'authenticated' && change.member.discordId === state.user.discordId)
        refreshSession();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo cambiar el rol.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="member-roles" aria-label="Gestión de roles">
      <h2>Roles Management</h2>
      <p>
        {canManage
          ? 'Gestiona el acceso de los miembros: viewer, admin u owner.'
          : 'Consulta los miembros y sus roles. Solo un owner puede modificarlos.'}
      </p>
      <div className="member-roles-toolbar">
        <label htmlFor="member-search">
          Buscar miembro
          <input
            id="member-search"
            type="search"
            placeholder="Usuario, nombre o ID de Discord"
            value={search}
            maxLength={120}
            disabled={busy}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
              setChange(null);
            }}
          />
        </label>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || loading}
          onClick={() => {
            setChange(null);
            setRevision((value) => value + 1);
          }}
        >
          Actualizar
        </button>
      </div>
      {notice && <output className="member-roles-success">{notice}</output>}
      {error && (
        <div className="member-roles-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => {
              setChange(null);
              setRevision((value) => value + 1);
            }}
          >
            Recargar lista
          </button>
        </div>
      )}
      {change && canManage && (
        <section className="member-roles-confirmation" aria-label="Confirmar cambio de rol">
          <h3>Cambiar el rol de {change.member.username}</h3>
          <p>
            {change.member.discordId} · {change.member.role} → {change.role}
          </p>
          {change.role === 'owner' && (
            <p>Un owner puede asignar y retirar roles a otros miembros.</p>
          )}
          <div className="member-roles-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void saveRole()}
            >
              {busy ? 'Guardando…' : 'Confirmar cambio'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => setChange(null)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}
      {loading ? (
        <output>Cargando miembros…</output>
      ) : (
        page && (
          <>
            {page.members.length === 0 ? (
              <p className="empty-state">
                {search
                  ? 'No hay miembros que coincidan con la búsqueda.'
                  : 'Todavía no hay miembros registrados.'}
              </p>
            ) : (
              <MemberRolesTable
                members={page.members}
                canManage={canManage}
                disabled={busy || Boolean(change)}
                onChange={(member, role) => {
                  setChange({ member, role });
                  setNotice('');
                }}
              />
            )}
            <div className="member-roles-pagination">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || offset === 0}
                onClick={() => {
                  setOffset(offset - 50);
                  setChange(null);
                }}
              >
                Anterior
              </button>
              <span>Página {offset / 50 + 1}</span>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || !page.hasMore}
                onClick={() => {
                  setOffset(offset + 50);
                  setChange(null);
                }}
              >
                Siguiente
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}

export function MemberRolesTable({
  members,
  canManage,
  disabled,
  onChange
}: {
  members: RoleMember[];
  canManage: boolean;
  disabled: boolean;
  onChange: (member: RoleMember, role: MemberRole) => void;
}) {
  return (
    <div className="member-roles-table">
      <table>
        <caption className="sr-only">Miembros y roles de acceso</caption>
        <thead>
          <tr>
            <th scope="col">Miembro</th>
            <th scope="col">ID de Discord</th>
            <th scope="col">Rol</th>
            {canManage && <th scope="col">Cambiar rol</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.discordId}>
              <td>
                <strong>{member.globalName ?? member.username}</strong>
                <small>{member.username}</small>
              </td>
              <td>{member.discordId}</td>
              <td>
                <span className="member-role-badge">{member.role}</span>
              </td>
              {canManage && (
                <td>
                  <select
                    aria-label={`Rol de ${member.username}`}
                    value={member.role}
                    disabled={disabled}
                    onChange={(event) => {
                      const role = event.target.value;
                      if (role === 'viewer' || role === 'admin' || role === 'owner')
                        onChange(member, role);
                    }}
                  >
                    <option value="viewer">viewer</option>
                    <option value="admin">admin</option>
                    <option value="owner">owner</option>
                  </select>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
