export default function LandingProof({ t }) {
  return (
    <section className="landing__proof">
      <h2 className="landing__section-title landing__section-title--center">{t.proofTitle}</h2>
      <div className="landing-proof__grid">
        {t.proof.map((card) => (
          <article key={card.role} className="landing-proof__card glass-panel">
            <p className="landing-proof__quote">&ldquo;{card.quote}&rdquo;</p>
            <footer>
              <strong>{card.role}</strong>
              <span>{card.stat}</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
