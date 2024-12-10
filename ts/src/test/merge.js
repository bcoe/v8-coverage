const chai = require("chai");
const fs = require("fs");
const path = require("path");
const { FunctionCov, mergeFunctionCovs, mergeProcessCovs, mergeScriptCovs, ProcessCov, ScriptCov } = require("../lib");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const BENCHES_INPUT_DIR = path.join(REPO_ROOT, "benches");
const BENCHES_DIR = path.join(REPO_ROOT, "test-data", "merge", "benches");
const RANGES_DIR = path.join(REPO_ROOT, "test-data", "merge", "ranges");
const BENCHES_TIMEOUT = 20000; // 20sec

const FIXTURES_DIR = path.join(REPO_ROOT, "test-data", "bugs");
function loadFixture(name) {
  const content = fs.readFileSync(
    path.resolve(FIXTURES_DIR, `${name}.json`),
    {encoding: "UTF-8"},
  );
  return JSON.parse(content);
}

describe("merge", () => {
  describe("Various", () => {
    it("accepts empty arrays for `mergeProcessCovs`", () => {
      const inputs = [];
      const expected = {result: []};
      const actual = mergeProcessCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts empty arrays for `mergeScriptCovs`", () => {
      const inputs = [];
      const expected = undefined;
      const actual = mergeScriptCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts empty arrays for `mergeFunctionCovs`", () => {
      const inputs  = [];
      const expected = undefined;
      const actual  = mergeFunctionCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts arrays with a single item for `mergeProcessCovs`", () => {
      const inputs = [
        {
          result: [
            {
              scriptId: "123",
              url: "/lib.js",
              functions: [
                {
                  functionName: "test",
                  isBlockCoverage: true,
                  ranges: [
                    {startOffset: 0, endOffset: 4, count: 2},
                    {startOffset: 1, endOffset: 2, count: 1},
                    {startOffset: 2, endOffset: 3, count: 1},
                  ],
                },
              ],
            },
          ],
        },
      ];
      const expected = {
        result: [
          {
            scriptId: "0",
            url: "/lib.js",
            functions: [
              {
                functionName: "test",
                isBlockCoverage: true,
                ranges: [
                  {startOffset: 0, endOffset: 4, count: 2},
                  {startOffset: 1, endOffset: 3, count: 1},
                ],
              },
            ],
          },
        ],
      };
      const actual = mergeProcessCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    describe("mergeProcessCovs", () => {
      // see: https://github.com/demurgos/v8-coverage/issues/2
      it("handles function coverage merged into block coverage", () => {
        const blockCoverage = loadFixture("issue-2-block-coverage");
        const functionCoverage  = loadFixture("issue-2-func-coverage");
        const inputs = [
          functionCoverage,
          blockCoverage,
        ];
        const expected = loadFixture("issue-2-expected");
        const actual = mergeProcessCovs(inputs);
        chai.assert.deepEqual(actual, expected);
      });

      // see: https://github.com/demurgos/v8-coverage/issues/2
      it("handles block coverage merged into function coverage", () => {
        const blockCoverage = loadFixture("issue-2-block-coverage");
        const functionCoverage = loadFixture("issue-2-func-coverage");
        const inputs = [
          blockCoverage,
          functionCoverage,
        ];
        const expected = loadFixture("issue-2-expected");
        const actual = mergeProcessCovs(inputs);
        chai.assert.deepEqual(actual, expected);
      });
    });

    it("accepts arrays with a single item for `mergeScriptCovs`", () => {
      const inputs = [
        {
          scriptId: "123",
          url: "/lib.js",
          functions: [
            {
              functionName: "test",
              isBlockCoverage: true,
              ranges: [
                {startOffset: 0, endOffset: 4, count: 2},
                {startOffset: 1, endOffset: 2, count: 1},
                {startOffset: 2, endOffset: 3, count: 1},
              ],
            },
          ],
        },
      ];
      const expected = {
        scriptId: "123",
        url: "/lib.js",
        functions: [
          {
            functionName: "test",
            isBlockCoverage: true,
            ranges: [
              {startOffset: 0, endOffset: 4, count: 2},
              {startOffset: 1, endOffset: 3, count: 1},
            ],
          },
        ],
      };
      const actual = mergeScriptCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });

    it("accepts arrays with a single item for `mergeFunctionCovs`", () => {
      const inputs = [
        {
          functionName: "test",
          isBlockCoverage: true,
          ranges: [
            {startOffset: 0, endOffset: 4, count: 2},
            {startOffset: 1, endOffset: 2, count: 1},
            {startOffset: 2, endOffset: 3, count: 1},
          ],
        },
      ];
      const expected = {
        functionName: "test",
        isBlockCoverage: true,
        ranges: [
          {startOffset: 0, endOffset: 4, count: 2},
          {startOffset: 1, endOffset: 3, count: 1},
        ],
      };
      const actual = mergeFunctionCovs(inputs);
      chai.assert.deepEqual(actual, expected);
    });
  });

  describe("ranges", () => {
    for (const sourceFile of getSourceFiles()) {
      const relPath = path.relative(RANGES_DIR, sourceFile);
      describe(relPath, () => {
        const content = fs.readFileSync(sourceFile, {encoding: "UTF-8"});
        const items  = JSON.parse(content);
        for (const item of items) {
          const test = () => {
            const actual = mergeProcessCovs(item.inputs);
            chai.assert.deepEqual(actual, item.expected);
          };
          switch (item.status) {
            case "run":
              it(item.name, test);
              break;
            case "only":
              it.only(item.name, test);
              break;
            case "skip":
              it.skip(item.name, test);
              break;
            default:
              throw new Error(`Unexpected status: ${item.status}`);
          }
        }
      });
    }
  });

  describe("benches", () => {
    for (const bench of getBenches()) {
      const BENCHES_TO_SKIP = new Set();
      // T?ODO: figure out why these need to be skipped.
      BENCHES_TO_SKIP.add("node@10.11.0");
      BENCHES_TO_SKIP.add("npm@6.4.1");

      const name = path.basename(bench);

      if (BENCHES_TO_SKIP.has(name)) {
        it.skip(`${name} (skipped: too large for CI)`, testBench);
      } else {
        it(name, testBench);
      }

      async function testBench() {
        this.timeout(BENCHES_TIMEOUT);

        const inputFileNames = await fs.promises.readdir(bench);
        const inputPromises = [];
        for (const inputFileName of inputFileNames) {
          const resolved = path.join(bench, inputFileName);
          inputPromises.push(fs.promises.readFile(resolved).then(buffer => JSON.parse(buffer.toString("UTF-8"))));
        }
        const inputs  = await Promise.all(inputPromises);
        const expectedPath = path.join(BENCHES_DIR, `${name}.json`);
        const expectedContent = await fs.promises.readFile(expectedPath, {encoding: "UTF-8"});
        const expected = JSON.parse(expectedContent);
        const startTime = Date.now();
        const actual  = mergeProcessCovs(inputs);
        const endTime = Date.now();
        console.error(`Time (${name}): ${(endTime - startTime) / 1000}`);
        chai.assert.deepEqual(actual, expected);
        console.error(`OK: ${name}`);
      }
    }
  });
});

function getSourceFiles() {
  return getSourcesFrom(RANGES_DIR);

  function* getSourcesFrom(dir) {
    const names = fs.readdirSync(dir);
    for (const name of names) {
      const resolved = path.join(dir, name);
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        yield* getSourcesFrom(dir);
      } else {
        yield resolved;
      }
    }
  }
}

function* getBenches() {
  const names = fs.readdirSync(BENCHES_INPUT_DIR);
  for (const name of names) {
    const resolved = path.join(BENCHES_INPUT_DIR, name);
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      yield resolved;
    }
  }
}
