const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/**
 * O Metro só olha pra dentro da pasta do projeto. Como `db.ts`,
 * `match-generator.ts` e companhia moram em `../shared` (um arquivo só,
 * usado pela web e pelo app), ele precisa ser avisado — senão o bundle
 * quebra com "Unable to resolve module ../../shared/db".
 *
 * `nodeModulesPaths` aponta de volta pro `mobile/node_modules` porque o
 * `shared/` não tem os dele: quando um arquivo de lá importa
 * `@supabase/supabase-js`, é aqui que o Metro vai achar.
 */
const projeto = __dirname;
const raiz = path.resolve(projeto, "..");

const config = getDefaultConfig(projeto);

config.watchFolders = [path.resolve(raiz, "shared")];
config.resolver.nodeModulesPaths = [
  path.resolve(projeto, "node_modules"),
  path.resolve(raiz, "node_modules"),
];

module.exports = config;
