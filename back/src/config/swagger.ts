import * as yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonObject } from 'swagger-ui-express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const swaggerSpec = yaml.load(
  fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8')
) as JsonObject