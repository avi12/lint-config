const PREFIXES = ["is", "has", "can", "should"];
const COMPARISONS = new Set(["===", "!==", "==", "!=", "<", ">", "<=", ">=", "in", "instanceof"]);
const BOOLEAN_METHODS = new Set([
  "has",
  "includes",
  "some",
  "every",
  "startsWith",
  "endsWith",
  "test",
  "isArray",
  "isFinite",
  "isInteger",
  "isNaN",
  "hasOwn"
]);
const UPPER = /^[A-Z0-9]+(_[A-Z0-9]+)*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const FORMATS = {
  camelCase: CAMEL,
  UPPER_CASE: UPPER,
  PascalCase: PASCAL
};
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function isBooleanType(annotation) {
  const type = annotation?.typeAnnotation ?? annotation;
  if (type == null) {
    return false;
  }

  if (type.type === "TSUnionType") {
    function isNullish(member) {
      return member.type === "TSNullKeyword" || member.type === "TSUndefinedKeyword";
    }
    const rest = type.types.filter(member => !isNullish(member));
    return rest.length === 1 && rest.length < type.types.length ? isBooleanType(rest[0]) : false;
  }

  if (type.type === "TSBooleanKeyword") {
    return true;
  }

  return type.type === "TSLiteralType" && typeof type.literal?.value === "boolean";
}

function isBooleanExpression(node, booleanFunctions) {
  if (node == null) {
    return false;
  }

  switch (node.type) {
    case "Literal":
      return typeof node.value === "boolean";
    case "UnaryExpression":
      return node.operator === "!";
    case "BinaryExpression":
      return COMPARISONS.has(node.operator);
    case "LogicalExpression":
      return isBooleanExpression(node.left, booleanFunctions) && isBooleanExpression(node.right, booleanFunctions);
    case "ConditionalExpression":
      return (
        isBooleanExpression(node.consequent, booleanFunctions) && isBooleanExpression(node.alternate, booleanFunctions)
      );
    case "TSAsExpression":
      return isBooleanType(node.typeAnnotation);
    case "TSNonNullExpression":
    case "TSSatisfiesExpression":
      return isBooleanExpression(node.expression, booleanFunctions);
    case "CallExpression": {
      const callee = node.callee;
      if (callee.type === "Identifier") {
        return callee.name === "Boolean" || booleanFunctions.has(callee.name);
      }

      const isMember = callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier";
      return isMember && BOOLEAN_METHODS.has(callee.property.name);
    }
    default:
      return false;
  }
}

function literalKind(node) {
  if (node == null) {
    return null;
  }

  if (node.type === "Literal") {
    if (typeof node.value === "string") {
      return "string";
    }

    if (typeof node.value === "number") {
      return "number";
    }
  }

  if (node.type === "TemplateLiteral") {
    return "string";
  }

  const isSignedNumber =
    node.type === "UnaryExpression" &&
    (node.operator === "-" || node.operator === "+") &&
    node.argument.type === "Literal" &&
    typeof node.argument.value === "number";
  return isSignedNumber ? "number" : null;
}

function annotationKind(annotation) {
  const type = annotation?.typeAnnotation ?? annotation;
  const kinds = {
    TSStringKeyword: "string",
    TSNumberKeyword: "number"
  };
  return kinds[type?.type] ?? null;
}

function checkFormats(name, formats) {
  return formats.some(format => FORMATS[format].test(name));
}

function checkPrefixed(name) {
  const prefix = PREFIXES.find(candidate => name.startsWith(candidate));
  return prefix != null && PASCAL.test(name.slice(prefix.length));
}

function collectBooleanFunctions(program) {
  const names = new Set();
  function returnsBoolean(func) {
    if (isBooleanType(func.returnType)) {
      return true;
    }

    if (func.body?.type !== "BlockStatement") {
      return isBooleanExpression(func.body, names);
    }

    const returns = [];
    function walk(node) {
      if (node == null || typeof node.type !== "string") {
        return;
      }

      if (node.type === "ReturnStatement") {
        returns.push(node);
        return;
      }

      const isNested =
        node.type.includes("Function") || node.type === "ClassDeclaration" || node.type === "ClassExpression";
      if (isNested) {
        return;
      }

      for (const key of Object.keys(node)) {
        if (key === "parent") {
          continue;
        }

        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            walk(item);
          }
        } else if (child && typeof child === "object") {
          walk(child);
        }
      }
    }
    walk(func.body);
    return returns.length > 0 && returns.every(statement => isBooleanExpression(statement.argument, names));
  }
  for (const statement of program.body) {
    const declaration = statement.declaration ?? statement;
    if (declaration.type === "FunctionDeclaration" && declaration.id && returnsBoolean(declaration)) {
      names.add(declaration.id.name);
    }

    const declarators = declaration.type === "VariableDeclaration" ? declaration.declarations : [];
    for (const declarator of declarators) {
      const isFunction =
        declarator.init &&
        (declarator.init.type === "ArrowFunctionExpression" || declarator.init.type === "FunctionExpression");
      if (isFunction && declarator.id.type === "Identifier" && returnsBoolean(declarator.init)) {
        names.add(declarator.id.name);
      }
    }
  }
  return names;
}

function keyName(node) {
  if (node.computed) {
    return null;
  }

  if (node.key.type === "Identifier") {
    return {
      name: node.key.name,
      isQuoted: false
    };
  }

  if (node.key.type === "Literal" && typeof node.key.value === "string") {
    return {
      name: node.key.value,
      isQuoted: !IDENTIFIER.test(node.key.value)
    };
  }

  return null;
}

const MISSING_REASON = "naming/convention: every allowedNames and fileOverrides entry needs a non-empty reason";

function assertReasons(options) {
  const entries = [...(options.allowedNames ?? []), ...(options.fileOverrides ?? [])];
  const isMissing = entries.some(entry => typeof entry.reason !== "string" || entry.reason.trim() === "");
  if (isMissing) {
    throw new Error(MISSING_REASON);
  }
}

const rule = {
  meta: {
    schema: [{ type: "object" }]
  },
  create(context) {
    const options = context.options[0] ?? {};
    assertReasons(options);
    const filename = (context.filename ?? context.getFilename()).replace(/\\/g, "/");
    const isOverridden = (options.fileOverrides ?? []).some(override =>
      override.files.some(suffix => filename.endsWith(suffix))
    );
    if (isOverridden) {
      return {};
    }

    const allowedNames = new Set((options.allowedNames ?? []).flatMap(entry => entry.names));
    let booleanFunctions = new Set();
    function report(node, message) {
      context.report({
        node,
        message
      });
    }

    function checkMember(node, selectorName) {
      const key = keyName(node);
      const isMethodSelector =
        selectorName.endsWith("Method") || selectorName === "classMethod" || selectorName === "accessor";
      if (key == null || (key.isQuoted && !isMethodSelector)) {
        return;
      }

      const { name } = key;
      if (allowedNames.has(name)) {
        return;
      }

      const isBoolean =
        selectorName === "classProperty" &&
        (isBooleanType(node.typeAnnotation) || isBooleanExpression(node.value, booleanFunctions));
      if (isBoolean) {
        if (!checkPrefixed(name)) {
          report(node.key, `${selectorName} '${name}' must be prefixed is/has/can/should`);
        }

        return;
      }

      if (!checkFormats(name, ["camelCase", "UPPER_CASE"])) {
        report(node.key, `${selectorName} '${name}' must be camelCase or UPPER_CASE`);
      }
    }

    function checkParameter(param, isProperty, declaredType = null) {
      let target = param;
      let initializer = null;
      if (target.type === "TSParameterProperty") {
        target = target.parameter;
      }

      if (target.type === "AssignmentPattern") {
        initializer = target.right;
        target = target.left;
      }

      if (target.type === "RestElement") {
        target = target.argument;
      }

      if (target.type === "ObjectPattern") {
        for (const property of target.properties) {
          const isNamed =
            property.type === "Property" &&
            (property.value.type === "Identifier" ||
              (property.value.type === "AssignmentPattern" && property.value.left.type === "Identifier"));
          if (isNamed) {
            const literal = target.typeAnnotation?.typeAnnotation;
            const member =
              literal?.type === "TSTypeLiteral"
                ? literal.members.find(candidate => candidate.key?.name === property.key?.name)
                : undefined;
            checkParameter(property.value, false, member?.typeAnnotation ?? null);
          }
        }
        return;
      }

      if (target.type !== "Identifier") {
        return;
      }

      const name = target.name;
      const isBoolean =
        isBooleanType(target.typeAnnotation ?? declaredType) || isBooleanExpression(initializer, booleanFunctions);
      if (allowedNames.has(name)) {
        return;
      }

      if (isBoolean) {
        if (!checkPrefixed(name)) {
          report(
            target,
            `${isProperty ? "parameterProperty" : "parameter"} '${name}' must be prefixed is/has/can/should`
          );
        }

        return;
      }

      if (isProperty) {
        if (!checkFormats(name, ["camelCase", "UPPER_CASE"])) {
          report(target, `parameterProperty '${name}' must be camelCase or UPPER_CASE`);
        }

        return;
      }

      const stripped = name.replace(/^_+/, "");
      if (stripped !== "" && !CAMEL.test(stripped)) {
        report(target, `parameter '${name}' must be camelCase`);
      }
    }

    function checkFunctionParams(node) {
      for (const param of node.params) {
        checkParameter(param, param.type === "TSParameterProperty");
      }
    }

    function isGlobalDeclaration(declaration) {
      let parent = declaration.parent;
      if (parent?.type === "ExportNamedDeclaration") {
        parent = parent.parent;
      }

      return parent?.type === "Program";
    }

    function checkVariable(declarator) {
      const declaration = declarator.parent;
      if (declaration?.type !== "VariableDeclaration") {
        return;
      }

      const isGlobalConst = declaration.kind === "const" && isGlobalDeclaration(declaration);
      const isDirect = declarator.id.type === "Identifier";
      const identifiers = [];
      function collect(pattern) {
        if (pattern.type === "Identifier") {
          identifiers.push(pattern);
        } else if (pattern.type === "ObjectPattern") {
          for (const property of pattern.properties) {
            collect(property.value ?? property.argument);
          }
        } else if (pattern.type === "ArrayPattern") {
          for (const element of pattern.elements) {
            if (element) {
              collect(element);
            }
          }
        } else if (pattern.type === "AssignmentPattern") {
          collect(pattern.left);
        } else if (pattern.type === "RestElement") {
          collect(pattern.argument);
        }
      }
      collect(declarator.id);
      for (const pattern of identifiers) {
        const name = pattern.name;
        if (allowedNames.has(name)) {
          continue;
        }

        const kind = isDirect
          ? (annotationKind(pattern.typeAnnotation) ??
            (pattern.typeAnnotation == null ? literalKind(declarator.init) : null))
          : null;
        const isBoolean =
          isDirect &&
          (isBooleanType(pattern.typeAnnotation) ||
            (pattern.typeAnnotation == null && isBooleanExpression(declarator.init, booleanFunctions)));
        if (isBoolean && isGlobalConst) {
          const isValid = UPPER.test(name) && /^(IS|HAS|CAN|SHOULD)_/.test(name);
          if (!isValid) {
            report(pattern, `global const boolean '${name}' must be UPPER_CASE starting IS_/HAS_/CAN_/SHOULD_`);
          }
        } else if (isBoolean) {
          if (!checkPrefixed(name)) {
            report(pattern, `boolean variable '${name}' must be prefixed is/has/can/should`);
          }
        } else if (kind != null && isGlobalConst) {
          if (!UPPER.test(name)) {
            report(pattern, `global const ${kind} '${name}' must be UPPER_CASE`);
          }
        } else if (isGlobalConst) {
          if (!checkFormats(name, ["camelCase", "UPPER_CASE", "PascalCase"])) {
            report(pattern, `global const '${name}' must be camelCase, UPPER_CASE or PascalCase`);
          }
        } else if (!CAMEL.test(name)) {
          report(pattern, `variable '${name}' must be camelCase`);
        }
      }
    }

    function checkTypeName(id, formats, label) {
      if (id && !checkFormats(id.name, formats)) {
        report(id, `${label} '${id.name}' must be ${formats.join(" or ")}`);
      }
    }

    return {
      Program(node) {
        booleanFunctions = collectBooleanFunctions(node);
      },
      VariableDeclarator: checkVariable,
      FunctionDeclaration(node) {
        if (node.id && !CAMEL.test(node.id.name)) {
          report(node.id, `function '${node.id.name}' must be camelCase`);
        }

        checkFunctionParams(node);
      },
      FunctionExpression: checkFunctionParams,
      ArrowFunctionExpression: checkFunctionParams,
      TSDeclareFunction: checkFunctionParams,
      PropertyDefinition(node) {
        checkMember(node, "classProperty");
      },
      MethodDefinition(node) {
        if (node.kind !== "constructor") {
          checkMember(node, node.kind === "get" || node.kind === "set" ? "accessor" : "classMethod");
        }
      },
      TSPropertySignature(node) {
        checkMember(node, "typeProperty");
      },
      Property(node) {
        if (node.parent?.type === "ObjectExpression") {
          const isFunctionValue =
            node.method || node.value?.type === "ArrowFunctionExpression" || node.value?.type === "FunctionExpression";
          checkMember(node, isFunctionValue ? "objectLiteralMethod" : "objectLiteralProperty");
        }
      },
      TSEnumMember(node) {
        const name = node.id.type === "Identifier" ? node.id.name : node.id.value;
        if (!UPPER.test(name)) {
          report(node.id, `enumMember '${name}' must be UPPER_CASE`);
        }
      },
      TSInterfaceDeclaration(node) {
        checkTypeName(node.id, ["PascalCase"], "interface");

        if (/^I[A-Z]/.test(node.id.name)) {
          report(node.id, `interface '${node.id.name}' must not start with I`);
        }
      },
      ClassDeclaration(node) {
        checkTypeName(node.id, ["PascalCase"], "class");
      },
      ClassExpression(node) {
        checkTypeName(node.id, ["PascalCase"], "class");
      },
      TSTypeAliasDeclaration(node) {
        checkTypeName(node.id, ["PascalCase"], "typeAlias");
      },
      TSEnumDeclaration(node) {
        checkTypeName(node.id, ["PascalCase"], "enum");
      },
      TSTypeParameter(node) {
        const name = typeof node.name === "string" ? node.name : node.name.name;
        if (!PASCAL.test(name)) {
          report(node, `typeParameter '${name}' must be PascalCase`);
        }
      }
    };
  }
};

export default {
  meta: {
    name: "naming"
  },
  rules: {
    convention: rule
  }
};
