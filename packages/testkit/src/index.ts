import type { MigrationPackageStatus } from '@graphiti/shared';

export const testkitPortStatus: MigrationPackageStatus = {
  packageName: '@graphiti/testkit',
  stage: 'scaffolded',
  notes:
    'Target package for parity fixtures, integration harnesses, and shared test data during the Python-to-TypeScript migration.'
};
