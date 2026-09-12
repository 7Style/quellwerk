/**
 * The stored text of two sources, as the viewer receives it.
 *
 * Normalised text, not markup: this is what a document looks like after
 * `modules/sources/internal/normalize.ts` has run once at ingest, and it is the
 * exact string a citation's offsets point into. The blank lines are part of it.
 *
 * Long enough that a mark near the end sits below the fold, because "the
 * passage is scrolled into view" is one of the things M4-T3 has to show.
 */

const REGULATION = `Article 9
Risk management system

1. A risk management system shall be established, implemented, documented and maintained in relation to high-risk AI systems.

2. The risk management system shall be understood as a continuous iterative process planned and run throughout the entire lifecycle of the high-risk AI system, requiring regular systematic review and updating. It shall comprise the following steps:

(a) the identification and analysis of the known and the reasonably foreseeable risks that the high-risk AI system can pose to health, safety or fundamental rights when the high-risk AI system is used in accordance with its intended purpose;

(b) the estimation and evaluation of the risks that may emerge when the high-risk AI system is used in accordance with its intended purpose, and under conditions of reasonably foreseeable misuse;

(c) the evaluation of other risks possibly arising, based on the analysis of data gathered from the post-market monitoring system referred to in Article 72;

(d) the adoption of appropriate and targeted risk management measures designed to address the risks identified pursuant to point (a).

3. The risks referred to in this Article shall concern only those which may be reasonably mitigated or eliminated through the development or design of the high-risk AI system, or the provision of adequate technical information.

Article 10
Data and data governance

1. High-risk AI systems which make use of techniques involving the training of AI models with data shall be developed on the basis of training, validation and testing data sets that meet the quality criteria referred to in paragraphs 2 to 5 whenever such data sets are used.

2. Training, validation and testing data sets shall be subject to data governance and management practices appropriate for the intended purpose of the high-risk AI system.

3. Training, validation and testing data sets shall be relevant, sufficiently representative, and to the best extent possible, free of errors and complete in view of the intended purpose. They shall have the appropriate statistical properties, including, where applicable, as regards the persons or groups of persons in relation to whom the high-risk AI system is intended to be used.

4. Data sets shall take into account, to the extent required by the intended purpose, the characteristics or elements that are particular to the specific geographical, contextual, behavioural or functional setting within which the high-risk AI system is intended to be used.

Article 11
Technical documentation

1. The technical documentation of a high-risk AI system shall be drawn up before that system is placed on the market or put into service and shall be kept up-to-date.

2. The technical documentation shall be drawn up in such a way as to demonstrate that the high-risk AI system complies with the requirements set out in this Section, and to provide national competent authorities and notified bodies with the necessary information in a clear and comprehensive form to assess the compliance of the AI system with those requirements.`;

const FAQ = `Navigating the AI Act

What must providers do before placing a high-risk system on the market?

Before a high-risk AI system is placed on the market or put into service, providers must establish, implement, document and maintain a risk management system and keep it current for as long as the system remains available. They must also draw up the technical documentation, put a quality management system in place, and register the system in the EU database.

Who counts as a provider?

A provider is the natural or legal person, public authority, agency or other body that develops an AI system or a general-purpose AI model, or that has one developed, and places it on the market or puts the AI system into service under its own name or trademark, whether for payment or free of charge.

When do the rules for high-risk AI systems start to apply?

The AI Act applies two years after entry into force, on 2 August 2026, except for specific provisions. The rules for high-risk AI systems will apply starting 2 December 2027. Rules on AI embedded in physical products apply starting 2 August 2028.

What happens if a provider does not comply?

Member States lay down the rules on penalties. Non-compliance with the prohibited practices in Article 5 is subject to the highest tier of administrative fines. For most other obligations the ceiling is lower, and for supplying incorrect information to notified bodies or national competent authorities lower still.`;

export const sourceTextFixtures: Record<string, string> = {
  s1: REGULATION,
  s2: FAQ,
};
