'use strict';

const glob = require('glob');
const path = require('path');
const fs = require('fs-promise');
const chai = require('chai');
const reactHtmlTemplate = require('../lib');

const expect = chai.expect;
const pattern = `${__dirname}/components/**/*.jsx.html`;
const components = glob.sync(pattern).map(f => ({
  srcPath: f,
  expectedPath: f.replace('.html', '')
}));

describe('E2E tests', function() {
  components.forEach(template => {
    const name = path.basename(template.srcPath, '.jsx.html');
    const contents = [
      fs.readFile(template.srcPath, 'utf8'),
      fs.readFile(template.expectedPath, 'utf8')
    ];
    const test = (html, expected) => {
      const res = reactHtmlTemplate({ html });
      expect(res.reactStr).to.equal(expected);
    };

    it(name, function(done) {
      Promise.all(contents)
        .then(res => test(...res))
        .then(done)
        .catch(done);
    });
  });
});
