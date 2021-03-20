#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { prompt } from "enquirer";
import { isArray, mergeWith } from "lodash";

const argv = require("minimist")(process.argv.slice(2));
const cwd = process.cwd();

const OPTIONS = [
  { name: "eslint", initial: true },
  { name: "prettier" },
  { name: "commitlint" },
];

async function init() {
  let targetDir: string | undefined = argv._[0];
  if (!targetDir) {
    const { name } = await prompt<{ name: string }>({
      type: "input",
      name: "name",
      message: `Project name:`,
      initial: "tsuke-project",
    });
    targetDir = name;
  }
  const root = path.join(cwd, targetDir);

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  } else {
    const existing = fs.readdirSync(root);
    if (existing.length) {
      const { yes } = await prompt<{ yes: boolean }>({
        type: "confirm",
        name: "yes",
        initial: "Y",
        message:
          `Target directory ${targetDir} is not empty.\n` +
          `Remove existing files and continue?`,
      });
      if (yes) {
        emptyDir(root);
      } else {
        return;
      }
    }
  }

  const { options } = await prompt<{ options: string[] }>({
    type: "multiselect",
    name: "options",
    message: "With:",
    choices: OPTIONS,
  });

  const templatesRootDir = path.resolve(__dirname, "../templates");
  copyTemplate(path.join(templatesRootDir, "repo-base"), root, options);
  let mergedOptions: string[] = [];
  options.forEach((option) => {
    copyTemplate(
      path.join(templatesRootDir, `with-${option}`),
      root,
      mergedOptions
    );
    mergedOptions = [...mergedOptions, option];
  });

  console.log(`\nBootstrapping repo in ${root}`);
}

function copyTemplate(template: string, dest: string, options: string[] = []) {
  const files = fs.readdirSync(template);
  files.forEach((file) => {
    const actualFileName = file.replace(/^\._/, ".");
    const targetFilePath = path.join(dest, actualFileName);
    const templateFilePath = path.join(template, file);
    const stat = fs.statSync(templateFilePath);

    if (stat.isDirectory()) {
      if (file === ".tsukemono") {
        const overrides = fs.readdirSync(templateFilePath);
        overrides.forEach((override) => {
          const overrideDir = path.join(template, ".tsukemono", override);
          const stats = fs.statSync(overrideDir);
          if (
            stats.isDirectory() &&
            options.includes(override.replace(/^with-/, ""))
          ) {
            copyTemplate(overrideDir, dest);
          }
        });
      } else {
        if (!fs.existsSync(targetFilePath)) fs.mkdirSync(targetFilePath);
        copyTemplate(templateFilePath, targetFilePath, options);
      }
    } else if (stat.isFile()) {
      if (!fs.existsSync(targetFilePath) || !isMergeable(actualFileName)) {
        fs.copyFileSync(templateFilePath, targetFilePath);
      } else {
        const mergeStrategy = mergeFiles[actualFileName];
        switch (mergeStrategy) {
          case "json":
            mergeJsonFile(targetFilePath, templateFilePath);
            break;
          case "append":
            appendFiles(targetFilePath, templateFilePath);
            break;
          default:
            throw new UnhandledCaseError(
              mergeStrategy,
              `Unhandled file merge strategy`
            );
        }
      }
    }
  });
}

function isMergeable(file: string): file is keyof MergeFiles {
  return Object.keys(mergeFiles).includes(file);
}

function mergeJsonFile(existing: string, template: string) {
  const existingFileContent = JSON.parse(
    fs.readFileSync(existing).toString().trim()
  );
  const templateFileContent = JSON.parse(
    fs.readFileSync(template).toString().trim()
  );
  const content = mergeWith(
    existingFileContent,
    templateFileContent,
    (a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      if (isArray(a)) return Array.from(new Set(a.concat(b)));
    }
  );
  fs.writeFileSync(existing, JSON.stringify(content, null, 2));
}

function appendFiles(existing: string, template: string) {
  const existingFileContent = fs.readFileSync(existing).toString().split("\n");
  const templateFileContent = fs.readFileSync(template).toString().split("\n");
  console.log({ existingFileContent, templateFileContent });
}

const mergeFiles = {
  ".eslintrc": "json",
  "package.json": "json",
  "lerna.json": "json",
  ".gitignore": "append",
  ".prettierignore": "append",
} as const;

type MergeFiles = typeof mergeFiles;

function addPackages(
  file: string,
  packages: Record<string, string>,
  depType?: "peer" | "dev"
) {
  const pkg = require(file);
  const depName = depType ? `${depType}Dependencies` : "dependencies";
  pkg[depName] = { ...(pkg[depName] || {}), ...packages };
  fs.writeFileSync(file, pkg);
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    const abs = path.resolve(dir, file);
    // baseline is Node 12 so can't use rmSync :(
    if (fs.lstatSync(abs).isDirectory()) {
      emptyDir(abs);
      fs.rmdirSync(abs);
    } else {
      fs.unlinkSync(abs);
    }
  }
}

init().catch(console.error);

class UnhandledCaseError extends Error {
  constructor(variable: never, message: string) {
    super(
      message ||
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Unhandled case whith variable of type ${typeof variable} with value ${variable}`
    );
  }
}
