
const fs = require('fs');
const readline = require('readline');

const packageJson = JSON.parse(fs.readFileSync('package.json', {encoding: 'utf-8'}));

async function main() {
  const ux = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  function ask(q) {
    return new Promise(resolve => {
      ux.question(q, input => resolve(input));
    });
  }
  
  try {
    let packageName = '';
    do {
      packageName = await ask('Enter package name: @observoid/');
      if (!/^[a-z](?:[a-z\-0-9]*?[a-z0-9])?$/.test(packageName)) {
        packageName = '';
        console.error('Invalid package name.');
        console.info('A valid package name should:');
        console.info('* start with a lower-case letter [a-z]');
        console.info('* contain only lower-case letters [a-z], decimal digits [0-9] and dashes [-]');
        console.info('* end in a lower-case letter [a-z] or a decimal digit [0-9]');
      }
    } while (!packageName);
    packageJson.name = '@observoid/'+packageName;
    packageJson.repository.url = "git+https://github.com/observoid/"+packageName+".git";
    packageJson.bugs.url = "https://github.com/observoid/"+packageName+"/issues";
    packageJson.homepage = "https://github.com/observoid/"+packageName+"#readme";
    let description = '';
    do {
      description = await ask('Enter description:');
    } while (!description);
    packageJson.description = description;
    delete packageJson.private;
    delete packageJson.scripts.setup;
    let author = '';
    do {
      author = await ask('Enter your name:');
    } while (!author);
    packageJson.author = author;
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    fs.writeFileSync('README.md', `# @observoid/${packageName}\n${description}`);
    fs.unlinkSync('template-setup.js');
    console.info('Complete!');
  }
  finally {
    ux.close();
  }
}

main();
