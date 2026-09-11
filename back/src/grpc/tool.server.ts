import { loadSync, type Options } from '@grpc/proto-loader';
import * as grpc from '@grpc/grpc-js';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { config } from '../config/index.js';

const require = createRequire(import.meta.url);
const contractsRoot = dirname(require.resolve('@ecomassistant/contracts/package.json'));
const PROTO_ROOT = join(contractsRoot, 'proto');

const loaderOptions: Options = {
  includeDirs: [PROTO_ROOT],
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

export interface HealthRequest {}

export interface HealthResponse {
  status: string;
}

interface ToolServiceConstructor {
  service: grpc.ServiceDefinition;
}

function loadToolService(): ToolServiceConstructor {
  const proto = grpc.loadPackageDefinition(
    loadSync(join(PROTO_ROOT, 'tools/v1/tool.proto'), loaderOptions)
  ) as unknown as {
    ecomassistant: {
      tools: {
        v1: {
          ToolService: ToolServiceConstructor;
        };
      };
    };
  };
  return proto.ecomassistant.tools.v1.ToolService;
}

function healthHandler(
  _call: grpc.ServerUnaryCall<HealthRequest, HealthResponse>,
  callback: grpc.sendUnaryData<HealthResponse>
): void {
  callback(null, { status: 'STATUS_SERVING' });
}

export async function startToolServer(): Promise<grpc.Server | null> {
  if (!config.toolsGrpcEnabled) {
    console.log('[gRPC] ToolService disabled (TOOLS_GRPC_ENABLED != true)');
    return null;
  }

  const server = new grpc.Server();
  server.addService(loadToolService().service, {
    Health: healthHandler,
  });

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      config.toolsGrpcAddr,
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`[gRPC] ToolService listening on ${config.toolsGrpcAddr} (port ${port})`);
        resolve();
      }
    );
  });

  return server;
}