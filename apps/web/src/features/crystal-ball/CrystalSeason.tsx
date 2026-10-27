import type { CrystalAnswers, CrystalBallData } from '@rcl/contracts';
import React, { useState } from 'react';
import { CommunityRankingPanel } from '../../shared/components/CommunityRanking/CommunityRankingPanel.js';
import { useGameCatalog } from '../../shared/riot/useGameCatalog.js';
import { discordLoginUrl } from '../auth/api/auth-api.js';
import { CrystalFields } from './CrystalFields.js';
import { CrystalRules } from './CrystalRules.js';
import { useCrystalBall } from './useCrystalBall.js';

export function CrystalSeason({
  season,
  divisionId,
  userId
}: { season: string; divisionId: string; userId: string | undefined }) {
  const model = useCrystalBall(season, divisionId, userId);
  const catalog = useGameCatalog();
  const champions = Object.entries(catalog)
    .filter(([key]) => key.startsWith('champion:'))
    .map(([key, value]) => ({
      id: key.slice(9).toLowerCase(),
      name: value.name,
      imageUrl: value.image ?? null
    }))
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
      {!userId && (
        <p className="crystal-login">
          <a href={discordLoginUrl}>Inicia sesion con Discord</a> para guardar tus predicciones.
        </p>
      )}
      {!champions.length && (
        <output>
          El catalogo de campeones no esta disponible. Recarga la pagina para volver a intentarlo.
        </output>
      )}
      <Ballot
        data={data}
        initial={model.answers}
        authenticated={Boolean(userId)}
        save={model.save}
      />
      <CommunityRankingPanel
        title="Ranking de videntes"
        headingId="seer-ranking"
        participant="Vidente"
        ownLabel="tu"
        userId={userId}
        ranking={data.ranking.map((row) => ({
          ...row,
          avatarHash: row.avatarHash ?? null,
          position: data.ranking.findIndex((other) => other.points === row.points) + 1,
          correct: row.points,
          total: data.questions.reduce(
            (total, question) => total + (data.results[question.id] ? question.count : 0),
            0
          )
        }))}
      />
      <CrystalRules campaign={data} />
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
  const [category, setCategory] = useState('qualification');
  const categories = [
    ['qualification', 'Clasificados'],
    ['classification', 'Equipos'],
    ['players', 'Jugadores'],
    ['meta', 'Meta']
  ] as const;
  const selected = categories.find(([id]) => id === category) ?? categories[0];
  const answered = data.questions.filter((q) => answers[q.id]?.length === q.count).length;
  const editable = authenticated && data.status === 'open';
  const complete = data.questions.every((q) => answers[q.id]?.length === q.count);
  return (
    <form
      className="crystal-ballot"
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
      <div className="crystal-ballot-heading">
        <span className="eyebrow">Tu bola de cristal</span>
        <span>
          {answered} / {data.questions.length} completadas
        </span>
      </div>
      <progress
        className="crystal-progress"
        value={answered}
        max={data.questions.length}
        aria-label="Predicciones completadas"
      />
      <nav className="crystal-categories" aria-label="Categorias de predicciones">
        {categories.map(([id, label], index) => (
          <button
            type="button"
            key={id}
            aria-pressed={id === category}
            onClick={() => setCategory(id)}
          >
            <span>0{index + 1}</span>
            {label}
            <small>
              {
                data.questions.filter((q) => q.category === id && answers[q.id]?.length === q.count)
                  .length
              }
              /{data.questions.filter((q) => q.category === id).length}
            </small>
          </button>
        ))}
      </nav>
      <section className="crystal-section" aria-label={selected[1]}>
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
      <div className="crystal-actions">
        <button type="submit" disabled={!editable || busy || !complete}>
          {busy ? 'Guardando…' : 'Guardar mi bola de cristal →'}
        </button>
        <output>
          {message || (editable && !complete ? 'Completa todas las selecciones para guardar.' : '')}
        </output>
      </div>
    </form>
  );
}
