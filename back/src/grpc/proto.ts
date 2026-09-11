import { type Options } from '@grpc/proto-loader';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const contractsRoot = dirname(require.resolve('@ecomassistant/contracts/package.json'));

export const PROTO_ROOT = join(contractsRoot, 'proto');

export const loaderOptions: Options = {
  includeDirs: [PROTO_ROOT],
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};