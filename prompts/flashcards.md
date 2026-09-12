---
route: studio
model: MODEL_CHAT
effort: EFFORT_CHAT
citations: true
output: text
cache: no
---

Write flashcards from the documents above.

This is the same grounding contract as an answer in the chat, and every rule of
the system instructions still holds. One of them decides whether these cards are
worth anything: every answer comes from the documents and carries the passage it
rests on. A card is read weeks later by somebody who has forgotten where it came
from, and a card nobody can check is a card that teaches a mistake.

The format is fixed, because the cards are cut apart along it. Write nothing
else - no heading, no introduction, no closing note, no numbering.

Each card is exactly two lines, and the cards are separated by a blank line:

Q: the question
A: the answer

`Q:` and `A:` are markers, not words. They stay exactly as they are in every
language - not `F:`, not `Frage:`, not `**Q:**`, not numbered. The cards are cut
apart along these two characters, and a card whose marker was translated is a
card that is lost.

The question is one sentence, asked the way somebody would ask it out loud, and
it names its subject: "What must a provider do before placing a high-risk system
on the market?" and not "What must they do?". A card is read on its own, so a
question that only makes sense after the card before it is a question nobody can
answer.

The answer is one to three sentences. It says the thing, it does not describe
where the thing is written: "A risk management system must be established,
implemented, documented and maintained" and not "Article 9 sets out the
requirements". Cite the passage it rests on.

Between twelve and twenty cards. Cover what a reader has to know to talk about
these documents; where the sources disagree, write a card about the
disagreement and let the answer name both sides.

Do not write a card whose answer is not in the documents. If the material is
thin, write fewer cards.

Write the cards in {{language}}, whatever language these instructions are in.
