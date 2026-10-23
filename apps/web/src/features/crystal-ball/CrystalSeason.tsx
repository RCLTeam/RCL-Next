import type { CrystalAnswers, CrystalBallData } from '@rcl/contracts';
import React, { useState } from 'react';
import { useGameCatalog } from '../../shared/riot/useGameCatalog.js';
import { discordLoginUrl } from '../auth/api/auth-api.js';
import { CrystalAdmin } from './CrystalAdmin.js';
import { CrystalFields } from './CrystalFields.js';
import { useCrystalBall } from './useCrystalBall.js';

const statuses = {
  unconfigured: 'Próximamente',
  upcoming: 'Apertura programada',
  open: 'Predicciones abiertas',
  closed: 'Predicciones cerradas',
  resolved: 'Resultados publicados'
};
export function CrystalSeason({
  season,
  userId,
  admin
}: { season: string; userId: string | undefined; admin: boolean }) {
  const model = useCrystalBall(season, userId);
  const catalog = useGameCatalog();
  const champions = Object.entries(catalog)
    .filter(([key]) => key.startsWith('champion:'))
    .map(([key, value]) => ({ id: key.slice(9).toLowerCase(), name: value.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (model.error && (!model.data || !model.answers))
    return (
      <div role="alert">
        {model.error}
        <button type="button" onClick={model.retry}>
          Reintentar
        </button>
      </div>
    );
  if (!model.data || !model.answers) return <output>Cargando predicciones…</output>;
  const data = {
    ...model.data,
    questions: model.data.questions.map((q) =>
      q.kind === 'champion' ? { ...q, options: champions } : q
    )
  };
  return (
    <>
      {model.error && <p role="alert">{model.error}</p>}
      <div className="crystal-status">
        <strong>{statuses[data.status]}</strong>
        <span>{data.opensAt && `Apertura: ${new Date(data.opensAt).toLocaleString('es-ES')}`}</span>
        <span>{data.closesAt && `Cierre: ${new Date(data.closesAt).toLocaleString('es-ES')}`}</span>
      </div>
      {!userId && (
        <p>
          <a href={discordLoginUrl}>Inicia sesión con Discord</a> para guardar tus predicciones.
        </p>
      )}
      <p>
        Selecciona 4 equipos para winner bracket y 2 para loser bracket en cada división. Las
        predicciones de jugadores y meta abarcan todos los playoffs de la temporada. Podrás
        modificar tu boleto hasta el cierre.
      </p>
      {!champions.length && (
        <output>
          El catálogo de campeones no está disponible. Recarga la página para volver a intentarlo.
        </output>
      )}
      <Ballot
        data={data}
        initial={model.answers}
        authenticated={Boolean(userId)}
        save={model.save}
      />
      <section className="crystal-ranking">
        <h2>Ranking de videntes</h2>
        {data.ranking.length ? (
          <ol>
            {data.ranking.map((row) => (
              <li key={row.userId}>
                <span>
                  {row.name}
                  {row.userId === userId ? ' (tú)' : ''}
                </span>
                <strong>{row.points} puntos</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p>La clasificación aparecerá cuando se publiquen resultados.</p>
        )}
        <p>
          {Object.keys(data.results).length} de {data.questions.length} predicciones resueltas.
        </p>
      </section>
      {admin && <CrystalAdmin data={data} configure={model.configure} resolve={model.resolve} />}
    </>
  );
}
function Ballot({
  data,
  initial,
  authenticated,
  save
}: {
  data: CrystalBallData;
  initial: CrystalAnswers;
  authenticated: boolean;
  save: (answers: CrystalAnswers) => Promise<void>;
}) {
  const [answers, setAnswers] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const editable = authenticated && data.status === 'open';
  const complete = data.questions.every((q) => answers[q.id]?.length === q.count);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        try {
          await save(answers);
          setMessage('Predicciones guardadas. Puedes modificarlas hasta el cierre.');
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'No se pudo guardar.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {(
        [
          ['qualification', '01 · Clasificados para playoffs'],
          ['classification', '🏆 Clasificación'],
          ['players', '⭐ Jugadores'],
          ['meta', '🧪 Meta']
        ] as const
      ).map(([category, title]) => (
        <section className="crystal-section" key={category}>
          <h2>{title}</h2>
          {category === 'meta' && (
            <p>
              Oro: diferencia final exacta entre equipos. Duración: intervalos de cinco minutos
              (menos de 20 y 45 o más en los extremos). Las medias se calculan por partida; winrate
              exige al menos tres.
            </p>
          )}
          <CrystalFields
            questions={data.questions.filter((q) => q.category === category)}
            answers={answers}
            onChange={(next) => {
              setAnswers(next);
              setMessage('Cambios sin guardar');
            }}
            disabled={!editable || busy}
            results={data.results}
          />
        </section>
      ))}
      <div className="crystal-actions">
        <button type="submit" disabled={!editable || busy || !complete}>
          {busy ? 'Guardando…' : 'Guardar predicciones'}
        </button>
        <output>
          {message || (editable && !complete ? 'Completa todas las selecciones para guardar.' : '')}
        </output>
      </div>
    </form>
  );
}
