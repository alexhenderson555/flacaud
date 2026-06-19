import { Check, Minus } from 'lucide-react';

function Cell({ value, partialLabel }) {
  if (value === true) {
    return (
      <span className="landing-compare__yes" aria-label="Yes">
        <Check size={18} strokeWidth={2.5} />
      </span>
    );
  }
  if (value === 'partial') {
    return <span className="landing-compare__partial">{partialLabel}</span>;
  }
  return (
    <span className="landing-compare__no" aria-label="No">
      <Minus size={18} />
    </span>
  );
}

export default function LandingCompare({ t }) {
  return (
    <section id="compare" className="landing__compare">
      <h2 className="landing__section-title">{t.compareTitle}</h2>
      <p className="landing__section-sub landing__section-sub--center">{t.compareSub}</p>
      <div className="landing-compare__wrap glass-panel">
        <table className="landing-compare__table">
          <thead>
            <tr>
              {t.compareCols.map((col, i) => (
                <th key={col || 'feature'} className={i === 1 ? 'landing-compare__highlight' : ''}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.compareRows.map(([label, ...vals]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {vals.map((v, i) => (
                  <td key={String(v)} className={i === 0 ? 'landing-compare__highlight' : ''}>
                    <Cell value={v} partialLabel={t.comparePartial} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
