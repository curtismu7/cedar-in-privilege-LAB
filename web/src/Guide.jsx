import React from "react";

const LABEL_CLASS = { measured: "label-measured", "console text": "label-console", UNVERIFIED: "label-unverified" };

// A statement's label chip: measured, console text or UNVERIFIED, so a reader never takes a console line for a result.
export function Labelled({ item, testId }) {
  return (
    <span className="note-line" data-testid={testId}>
      <span className={`chip ${LABEL_CLASS[item.label] || ""}`} data-testid="label">{item.label}</span>
      <span>{item.text}</span>
    </span>
  );
}

// "Set up Cedar in Privilege": the eight console steps, for first-time users.
export function SetupGuide({ guide }) {
  if (!guide) return null;
  return (
    <section className="card" data-testid="setup-guide" id="setup">
      <h2>{guide.title}</h2>
      <p className="hint">{guide.lede}</p>
      <ol className="guide-steps">
        {guide.steps.map((s) => (
          <li key={s.n} data-testid={`guide-step-${s.n}`}>
            <strong>{s.title}</strong>
            <p>{s.what}</p>
            {s.notes.map((n) => <Labelled key={n.text} item={n} />)}
          </li>
        ))}
      </ol>
    </section>
  );
}

// The Cedar IS / IS NOT panel.
export function IsIsNot({ panel }) {
  if (!panel) return null;
  return (
    <section className="card" data-testid="is-is-not" id="is">
      <h2>{panel.title}</h2>
      <p className="hint">{panel.lede}</p>
      <div className="is-cols">
        <div>
          <h3>Cedar IS</h3>
          <ul className="is-list" data-testid="is-list">{panel.is.map((i) => <li key={i.text}><Labelled item={i} /></li>)}</ul>
        </div>
        <div>
          <h3>Cedar IS NOT</h3>
          <ul className="is-list" data-testid="is-not-list">{panel.isNot.map((i) => <li key={i.text}><Labelled item={i} /></li>)}</ul>
        </div>
      </div>
    </section>
  );
}
