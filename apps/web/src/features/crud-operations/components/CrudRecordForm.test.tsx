import type { CrudRecord, CrudResource } from '@rcl/contracts';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveCrudRecord } from '../api/crud-operations-api.js';
import { CrudRecordForm, initialValues } from './CrudRecordForm.js';

const resource: CrudResource = {
  name: 'memberships',
  label: 'Plantillas',
  description: '',
  keys: ['teamId', 'discordUserId'],
  fields: [
    { name: 'teamId', label: 'Equipo', type: 'text', required: true, immutable: true },
    { name: 'discordUserId', label: 'Miembro', type: 'text', required: true, immutable: true },
    {
      name: 'role',
      label: 'Rol',
      type: 'text',
      required: true,
      defaultValue: 'substitute',
      options: [
        'top',
        'jungle',
        'mid',
        'adc',
        'support',
        'substitute',
        'coach',
        'staff',
        'partners'
      ]
    },
    { name: 'isCaptain', label: 'Capitan', type: 'boolean' }
  ]
};
const record: CrudRecord = {
  teamId: 'team',
  discordUserId: 'player',
  role: 'top',
  isCaptain: true,
  seasonName: 'S1',
  updatedAt: '2026-10-12T12:00:00.000001Z'
};
const message =
  'El jugador ya pertenece a otra plantilla con un rol competitivo en esta temporada.';
afterEach(() => vi.unstubAllGlobals());

describe('roster form season rules', () => {
  it('renders a conflict with the supplied form values', () => {
    const html = renderToString(
      <CrudRecordForm
        resource={resource}
        record={record}
        busy={false}
        error={message}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(message);
    expect(html).toContain('value="player"');
    expect(html).toContain('value="top" selected');
    expect(html).not.toContain('Recargar datos');
    expect(html).not.toContain('seasonName');
  });
  it.each(['substitute', 'coach', 'staff', 'partners'])('disables captaincy for %s', (role) => {
    const html = renderToString(
      <CrudRecordForm
        resource={resource}
        record={{ ...record, role, isCaptain: false }}
        busy={false}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(html).toMatch(/type="checkbox"[^>]*disabled/);
  });
  it.each([null, record])(
    'preserves the conflict message and omits derived season from create/update payloads',
    async (current) => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'DATA_CONFLICT', message } }), {
          status: 409
        })
      );
      vi.stubGlobal('fetch', fetcher);
      const values = initialValues(resource, record);
      await expect(saveCrudRecord(resource, values, current)).rejects.toThrow(message);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const init = fetcher.mock.calls[0]?.[1];
      expect(init.method).toBe(current ? 'PUT' : 'POST');
      const body = JSON.parse(init.body);
      expect(current ? body.values : body).toEqual({
        teamId: 'team',
        discordUserId: 'player',
        role: 'top',
        isCaptain: true
      });
      if (current)
        expect(body).toMatchObject({
          key: { teamId: 'team', discordUserId: 'player' },
          version: record.updatedAt
        });
    }
  );
});
