// SPDX-License-Identifier: MIT

const plugin: Deno.lint.Plugin = {
  name: 'asm',
  rules: {
    curly: {
      create(context) {
        function requireBlock(body: Deno.lint.Statement): void {
          if (body.type !== 'BlockStatement') {
            context.report({ node: body, message: 'Wrap this body in braces.' });
          }
        }
        return {
          IfStatement(node) {
            requireBlock(node.consequent);
            if (node.alternate !== null && node.alternate.type !== 'IfStatement') {
              requireBlock(node.alternate);
            }
          },
          ForStatement(node) {
            requireBlock(node.body);
          },
          ForInStatement(node) {
            requireBlock(node.body);
          },
          ForOfStatement(node) {
            requireBlock(node.body);
          },
          WhileStatement(node) {
            requireBlock(node.body);
          },
          DoWhileStatement(node) {
            requireBlock(node.body);
          },
        };
      },
    },
  },
};

export default plugin;
