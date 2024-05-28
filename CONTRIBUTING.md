# Contributing

When contributing to this repository, please first discuss the change you wish to make via an issue, maintainers of this repository before making a change.

Please note we have a [code of conduct](https://raw.githubusercontent.com/stevensona/shader-toy/master/CODE_OF_CONDUCT.md), please follow it in all your interactions with the project.

## Building

```sh
git clone https://github.com/stevensona/shader-toy.git
cd shader-toy
npm install
npm run webpack
```

## Debugging

Open the project folder in Visual Studio Code. Now you can run the extension via the `Run Extension` button or pressing `F5`. However if you previously built via webpack you can not set breakpoints. If you wish to set breakpoints instead do the following:

- Go into `package.json` and change the `main` field to point to `out/src/extension.js`,
- open a new terminal in Visual Studio Code and execute `npm run watch`,
- now when running the extension you can set breakpoints and changes will rebuild automatically.

## Pull Requests

The rough process for PRs should be as follows:

1. Update README.md with examples for your new feature and one or more notes in the changelog,
2. make sure that the `main` field of `package.json` points to `dist/extension.js`,
3. remove any leftover debugging code or notes from the code,
4. make sure all files you touched are formatted,
5. give the maintainers some time to respond to your PR and please notify them if you can not or do not want to continue working the PR,
6. maintainers will merge your PR once any outstanding issues were resolved.
