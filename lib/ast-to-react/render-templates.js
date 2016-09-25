'use strict';

const astTypes = require('../html-to-ast').types;
const attributeConversion = require('../attribute-conversion');
const constants = require('../constants');

const INDENT = '  ';
const bindings = constants.attributes.bindings;
const loopsAttrs = constants.attributes.loops;

function getLoopNodes(node) {
  if (node.name === constants.tags.LOOPS) {
    return [ node ];
  }

  const reducer = (acc, child) => acc.concat(getLoopNodes(child));
  return node.children.reduce(reducer, []);
}

function renderLoop(node, varName, tagToVar) {
  const componentVarName = tagToVar[node.attrs[loopsAttrs.TEMPLATE_NAME]];
  const arrayName = node.attrs[loopsAttrs.ARRAY]
    .replace(bindings.STRICT_PATTERN, '$1')
    .trim();

  let component = `${INDENT}const ${varName} = ${arrayName}.map(e => (\n`;
  component = `${component}${INDENT}${INDENT}<${componentVarName}`;
  component = `${component} { ...e }`;
  component = `${component} key={ e.${node.attrs[loopsAttrs.KEY]} }`;
  component = `${component} />\n${INDENT}));\n`;
  return component;
}

function extractLoops(node, tagToVar) {
  const loopNodes = getLoopNodes(node);
  const reducer = (acc, node, i) => {
    const varName = `loop${i}`;

    // Set the variable name directly on the corresponding node.
    node.loopName = varName;

    const renderedLoop = renderLoop(node, varName, tagToVar);
    return `${acc}${renderedLoop}`;
  };

  return loopNodes.reduce(reducer, '');
}

function renderJsxText(node, indent) {
  let value = node.value;
  if (bindings.PATTERN.test(value)) {
    value = value.replace(bindings.PATTERN, '{ $1 }');
  }
  return `${indent}${value}\n`;
}

function renderJsxProps(node) {
  const mapper = k => {
    const attr = attributeConversion.toJsx(k);

    // Consider the absence or an empty attribute (i.e. `attr` or `attr=""`) as
    // `true`.
    const nodeValue = node.attrs[k] || 'true';
    let value;

    if (bindings.BOLLEAN_PATTERN.test(nodeValue)) {
      value = nodeValue.replace(
        bindings.BOLLEAN_PATTERN,
        (m, g1) => `{ ${g1.toLowerCase()} }`
      );

    // It only contains a binding (i.e. `attr="{{ expression }}")`, in this case
    // it should be converted to `attr={ expression }`.
    } else if (bindings.STRICT_PATTERN.test(nodeValue)) {
      value = nodeValue.replace(bindings.STRICT_PATTERN, '{ $1 }');

    // It is a string template (i.e. `attr="hello {{ expression }}"`), in this
    // case it should be converted to `attr={ `hello ${ expression }` }`.
    } else if (bindings.PATTERN.test(nodeValue)) {
      const replacement = nodeValue.replace(bindings.PATTERN, '$${ $1 }');
      value = `{ \`${replacement}\` }`;

    // There are no bindings, it is just a string.
    } else {
      value = `'${nodeValue}'`;
    }

    return `${attr}=${value}`;
  };

  const attrs = Object.keys(node.attrs)
    .map(mapper)
    .reduce((a, b) => `${a} ${b}`, '');

  return attrs;
}

function renderJsxTag(node, tagToVar, indent) {
  if (node.name === constants.tags.LOOPS) {
    return `${indent}{ ${node.loopName} }\n`;
  }

  const name = tagToVar[node.name] || node.name;
  const openTag = `<${name}`;
  const props = renderJsxProps(node);

  if (node.children.length > 0) {
    const closingTag = `</${name}>`;
    const children = node.children
      .map(child => renderJsxNode(child, tagToVar, `${INDENT}${indent}`))
      .join('');

    return `${indent}${openTag}${props}>\n${children}${indent}${closingTag}\n`;
  }

  return `${indent}${openTag}${props} />\n`;
}

function renderJsxNode(node, tagToVar, indent) {
  switch (node.type) {
    case astTypes.TEXT:
      return renderJsxText(node, indent);
    default:
      return renderJsxTag(node, tagToVar, indent);
  }
}

function extractJsx(node, tagToVar) {
  const jsx = renderJsxNode(node, tagToVar, `${INDENT}${INDENT}`);
  return `${INDENT}return (\n${jsx}${INDENT});\n`;
}

function renderTemplate(node, tagToVar) {
  // Remove the `<template>` tag.
  const template = node.children[0];

  const renderedLoops = extractLoops(template, tagToVar);
  const jsx = extractJsx(template, tagToVar);
  return `${renderedLoops}${jsx}`;
}

function renderDefaultTemplate(node, tagToVar) {
  const content = renderTemplate(node, tagToVar);
  return `export default function(props) {\n${content}}\n`;
}

function renderNamedTemplate(node, tagToVar) {
  const varName = tagToVar[node.attrs.name];
  const content = renderTemplate(node, tagToVar);
  return `export function ${varName}(props) {\n${content}}\n`;
}

function renderTemplates(options) {
  const renderedDefault = renderDefaultTemplate(
    options.defaultNode,
    options.tagToVar
  );

  const renderedNamed = options.namedNodes
    .map(node => renderNamedTemplate(node, options.tagToVar));

  return renderedNamed.concat([ renderedDefault ]);
}

module.exports = renderTemplates;