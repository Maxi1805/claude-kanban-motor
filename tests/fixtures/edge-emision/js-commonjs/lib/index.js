// Forma real de un módulo CommonJS (estilo lodash): sin un solo `import` ES.
var helper = require('./helper');
var parse = require('../vendor/parse');

require('./side-effect');

function run(input) {
  return helper.format(parse(input));
}

module.exports = run;
