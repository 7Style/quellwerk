import { notFound } from 'next/navigation';

import { StatesCatalogue } from './StatesCatalogue';

/**
 * The gate in front of the state catalogue.
 *
 * Server side, and at request time rather than at build time: the same image
 * then serves the page in a test run and refuses it on the server, which is
 * what makes "reachable" and "404 in production" both testable. The catalogue
 * itself is a client component because every specimen hands a handler to a
 * control, and a handler cannot cross that boundary.
 *
 * DEV_STATES is not set by deployment/prod, and scripts/security-check.sh
 * refuses a compose file that sets it.
 */
export const dynamic = 'force-dynamic';

export default function StatesPage() {
  if (process.env.DEV_STATES !== '1') notFound();

  return <StatesCatalogue />;
}
