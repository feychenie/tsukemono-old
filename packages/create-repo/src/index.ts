#!/usr/bin/env node

import { prompt } from "enquirer";

const argv = require("minimist")(process.argv.slice(2));

async function init() {
  let targetDir: string = argv._[0];
  if (!targetDir) {
    console.log({ targetDir });
    const { name } = await prompt<{ name: string }>({
      type: "input",
      name: "name",
      message: `Project name:`,
      initial: "tsuke-project",
    });
    targetDir = name;
  }

  console.log(`\nBootstrapping repo ${targetDir}`);
}

init().catch(console.error);
