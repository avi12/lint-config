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

function isNullishType(member) {
  return member.type === "TSNullKeyword" || member.type === "TSUndefinedKeyword";
}

function isBooleanType(annotation) {
  const type = annotation?.typeAnnotation ?? annotation;
  const isMissingType = type == null;
  if (isMissingType) {
    return false;
  }

  const isUnion = type.type === "TSUnionType";
  if (isUnion) {
    const rest = type.types.filter(member => !isNullishType(member));
    const isOptionalSingle = rest.length === 1 && rest.length < type.types.length;
    if (isOptionalSingle) {
      return isBooleanType(rest[0]);
    }

    return false;
  }

  const isBooleanKeyword = type.type === "TSBooleanKeyword";
  if (isBooleanKeyword) {
    return true;
  }

  return type.type === "TSLiteralType" && typeof type.literal?.value === "boolean";
}

function isBooleanExpression({ node, booleanFunctions }) {
  const isMissingNode = node == null;
  if (isMissingNode) {
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
      return (
        isBooleanExpression({
          node: node.left,
          booleanFunctions
        }) &&
        isBooleanExpression({
          node: node.right,
          booleanFunctions
        })
      );
    case "ConditionalExpression":
      return (
        isBooleanExpression({
          node: node.consequent,
          booleanFunctions
        }) &&
        isBooleanExpression({
          node: node.alternate,
          booleanFunctions
        })
      );
    case "TSAsExpression":
      return isBooleanType(node.typeAnnotation);
    case "TSNonNullExpression":
    case "TSSatisfiesExpression":
      return isBooleanExpression({
        node: node.expression,
        booleanFunctions
      });
    case "CallExpression": {
      const callee = node.callee;
      const isIdentifierCall = callee.type === "Identifier";
      if (isIdentifierCall) {
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
  const isMissingNode = node == null;
  if (isMissingNode) {
    return null;
  }

  const isLiteral = node.type === "Literal";
  if (isLiteral) {
    const isStringValue = typeof node.value === "string";
    if (isStringValue) {
      return "string";
    }

    const isNumberValue = typeof node.value === "number";
    if (isNumberValue) {
      return "number";
    }
  }

  const isTemplate = node.type === "TemplateLiteral";
  if (isTemplate) {
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

function checkFormats({ name, formats }) {
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

    const isExpressionBody = func.body?.type !== "BlockStatement";
    if (isExpressionBody) {
      return isBooleanExpression({
        node: func.body,
        booleanFunctions: names
      });
    }

    const returns = [];
    function walk(node) {
      const isNotNode = node == null || typeof node.type !== "string";
      if (isNotNode) {
        return;
      }

      const isReturn = node.type === "ReturnStatement";
      if (isReturn) {
        returns.push(node);
        return;
      }

      const isNested =
        node.type.includes("Function") || node.type === "ClassDeclaration" || node.type === "ClassExpression";
      if (isNested) {
        return;
      }

      for (const key of Object.keys(node)) {
        const isParentLink = key === "parent";
        if (isParentLink) {
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
    function isBooleanReturn(statement) {
      return isBooleanExpression({
        node: statement.argument,
        booleanFunctions: names
      });
    }
    return returns.length > 0 && returns.every(isBooleanReturn);
  }
  for (const statement of program.body) {
    const declaration = statement.declaration ?? statement;
    const isBooleanDeclaration =
      declaration.type === "FunctionDeclaration" && declaration.id && returnsBoolean(declaration);
    if (isBooleanDeclaration) {
      names.add(declaration.id.name);
    }

    const declarators = declaration.type === "VariableDeclaration" ? declaration.declarations : [];
    for (const declarator of declarators) {
      const isFunction =
        declarator.init &&
        (declarator.init.type === "ArrowFunctionExpression" || declarator.init.type === "FunctionExpression");
      const isBooleanFunction = isFunction && declarator.id.type === "Identifier" && returnsBoolean(declarator.init);
      if (isBooleanFunction) {
        names.add(declarator.id.name);
      }
    }
  }
  return names;
}

function isLiteralValue(node) {
  return literalKind(node) !== null || (node.type === "Literal" && typeof node.value === "boolean");
}

function isStringLiteral(node) {
  return literalKind(node) === "string";
}

function isNumberLiteral(node) {
  return literalKind(node) === "number";
}

function hasMatchingUnionAlias({ program, name }) {
  return program.body.some(statement => {
    const declaration = statement.declaration ?? statement;
    const query = declaration.typeAnnotation?.objectType;
    return (
      declaration.type === "TSTypeAliasDeclaration" &&
      declaration.id.name === name &&
      declaration.typeAnnotation.type === "TSIndexedAccessType" &&
      query?.type === "TSTypeQuery" &&
      query.exprName?.name === name
    );
  });
}

function isEnumLike({ objectExpression, program }) {
  const cast = objectExpression.parent;
  const declarator = cast?.parent;
  const isConstAssertion =
    cast?.type === "TSAsExpression" &&
    cast.typeAnnotation?.type === "TSTypeReference" &&
    cast.typeAnnotation.typeName?.name === "const";
  const isDeclared = declarator?.type === "VariableDeclarator" && declarator.id.type === "Identifier";
  const members = objectExpression.properties;
  const isPlain = members.length > 0 && members.every(member => member.type === "Property");
  if (!isConstAssertion || !isDeclared || !isPlain) {
    return false;
  }

  const isAllStrings = members.every(member => isStringLiteral(member.value));
  if (isAllStrings) {
    return true;
  }

  const isAllNumbers = members.every(member => isNumberLiteral(member.value));
  const isExported = declarator.parent?.parent?.type === "ExportNamedDeclaration";
  return (
    isAllNumbers &&
    isExported &&
    program !== null &&
    hasMatchingUnionAlias({
      program,
      name: declarator.id.name
    })
  );
}

function keyName(node) {
  if (node.computed) {
    return null;
  }

  const isIdentifierKey = node.key.type === "Identifier";
  if (isIdentifierKey) {
    return {
      name: node.key.name,
      isQuoted: false
    };
  }

  const isStringKey = node.key.type === "Literal" && typeof node.key.value === "string";
  if (isStringKey) {
    return {
      name: node.key.value,
      isQuoted: !IDENTIFIER.test(node.key.value)
    };
  }

  return null;
}

const MISSING_REASON =
  "naming/convention: every allowedNames, allowedPatterns and fileOverrides entry needs a non-empty reason";

const SVELTEKIT_ROUTE_FILE = /\/\+(?:page|layout)(?:\.server)?\.[cm]?[jt]s$/;
const SVELTEKIT_OPTIONS = ["ssr", "csr", "prerender", "trailingSlash"];

const PRESET_PATTERNS = {
  "webextension-manifest": /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/,
  "webextension-messages": /^[A-Z][A-Za-z0-9_]*$/,
  "hook-names": /^[a-z][A-Za-z0-9]*(:[A-Za-z][A-Za-z0-9]*)+$/
};

function presetNames({ options, filename }) {
  const isSveltekit = (options.presets ?? []).includes("sveltekit");
  const isRouteFile = SVELTEKIT_ROUTE_FILE.test(`/${filename}`);
  const isActive = isSveltekit && isRouteFile;
  return isActive ? SVELTEKIT_OPTIONS : [];
}

function compileAllowedPatterns(options) {
  const presets = (options.presets ?? [])
    .filter(name => name !== "sveltekit")
    .map(name => {
      const pattern = PRESET_PATTERNS[name];
      const isUnknownPreset = pattern == null;
      if (isUnknownPreset) {
        throw new Error(`naming/convention: unknown preset '${name}'`);
      }

      return pattern;
    });
  const patterns = (options.allowedPatterns ?? []).map(entry => new RegExp(entry.pattern, "u"));
  return [...presets, ...patterns];
}

function assertReasons(options) {
  const entries = [
    ...(options.allowedNames ?? []),
    ...(options.fileOverrides ?? []),
    ...(options.allowedPatterns ?? [])
  ];
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
    function matchesFile(suffix) {
      return filename.endsWith(suffix);
    }
    const isOverridden = (options.fileOverrides ?? []).some(override => override.files.some(matchesFile));
    if (isOverridden) {
      return {};
    }

    const allowedNames = new Set([
      ...(options.allowedNames ?? []).flatMap(entry => entry.names),
      ...presetNames({
        options,
        filename
      })
    ]);
    const allowedPatterns = compileAllowedPatterns(options);
    let program = null;
    let booleanFunctions = new Set();
    function report({ node, message }) {
      context.report({
        node,
        message
      });
    }

    function checkMember({ node, selectorName, formats = ["camelCase", "UPPER_CASE"] }) {
      const key = keyName(node);
      const isMethodSelector =
        selectorName.endsWith("Method") || selectorName === "classMethod" || selectorName === "accessor";
      const isIgnoredKey = key == null || (key.isQuoted && !isMethodSelector);
      if (isIgnoredKey) {
        return;
      }

      const { name } = key;
      const isAllowed = allowedNames.has(name) || allowedPatterns.some(pattern => pattern.test(name));
      if (isAllowed) {
        return;
      }

      const isBoolean =
        selectorName === "classProperty" &&
        (isBooleanType(node.typeAnnotation) ||
          isBooleanExpression({
            node: node.value,
            booleanFunctions
          }));
      if (isBoolean) {
        if (!checkPrefixed(name)) {
          report({
            node: node.key,
            message: `${selectorName} '${name}' must be prefixed is/has/can/should`
          });
        }

        return;
      }

      if (
        !checkFormats({
          name,
          formats
        })
      ) {
        report({
          node: node.key,
          message: `${selectorName} '${name}' must be ${formats.join(" or ")}`
        });
      }
    }

    function checkParameter({ param, isProperty, declaredType = null }) {
      let target = param;
      let initializer = null;
      const isParameterProperty = target.type === "TSParameterProperty";
      if (isParameterProperty) {
        target = target.parameter;
      }

      const isAssignmentPattern = target.type === "AssignmentPattern";
      if (isAssignmentPattern) {
        initializer = target.right;
        target = target.left;
      }

      const isRestElement = target.type === "RestElement";
      if (isRestElement) {
        target = target.argument;
      }

      const isObjectPattern = target.type === "ObjectPattern";
      if (isObjectPattern) {
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
            checkParameter({
              param: property.value,
              isProperty: false,
              declaredType: member?.typeAnnotation ?? null
            });
          }
        }
        return;
      }

      const isNotIdentifier = target.type !== "Identifier";
      if (isNotIdentifier) {
        return;
      }

      const name = target.name;
      const isBoolean =
        isBooleanType(target.typeAnnotation ?? declaredType) ||
        isBooleanExpression({
          node: initializer,
          booleanFunctions
        });
      if (allowedNames.has(name)) {
        return;
      }

      if (isBoolean) {
        if (!checkPrefixed(name)) {
          const kindLabel = isProperty ? "parameterProperty" : "parameter";
          report({
            node: target,
            message: `${kindLabel} '${name}' must be prefixed is/has/can/should`
          });
        }

        return;
      }

      if (isProperty) {
        if (
          !checkFormats({
            name,
            formats: ["camelCase", "UPPER_CASE"]
          })
        ) {
          report({
            node: target,
            message: `parameterProperty '${name}' must be camelCase or UPPER_CASE`
          });
        }

        return;
      }

      const stripped = name.replace(/^_+/, "");
      const hasInvalidStripped = stripped !== "" && !CAMEL.test(stripped);
      if (hasInvalidStripped) {
        report({
          node: target,
          message: `parameter '${name}' must be camelCase`
        });
      }
    }

    function checkFunctionParams(node) {
      for (const param of node.params) {
        checkParameter({
          param,
          isProperty: param.type === "TSParameterProperty"
        });
      }
    }

    function isGlobalDeclaration(declaration) {
      let parent = declaration.parent;
      const isExported = parent?.type === "ExportNamedDeclaration";
      if (isExported) {
        parent = parent.parent;
      }

      return parent?.type === "Program";
    }

    function checkVariable(declarator) {
      const declaration = declarator.parent;
      const isNotVariableDeclaration = declaration?.type !== "VariableDeclaration";
      if (isNotVariableDeclaration) {
        return;
      }

      const isGlobalConst = declaration.kind === "const" && isGlobalDeclaration(declaration);
      const isDirect = declarator.id.type === "Identifier";
      const identifiers = [];
      function collect(pattern) {
        const isIdentifierPattern = pattern.type === "Identifier";
        if (isIdentifierPattern) {
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
            (pattern.typeAnnotation == null &&
              isBooleanExpression({
                node: declarator.init,
                booleanFunctions
              })));
        const isGlobalBoolean = isBoolean && isGlobalConst;
        if (isGlobalBoolean) {
          const isValid = UPPER.test(name) && /^(IS|HAS|CAN|SHOULD)_/.test(name);
          if (!isValid) {
            report({
              node: pattern,
              message: `global const boolean '${name}' must be UPPER_CASE starting IS_/HAS_/CAN_/SHOULD_`
            });
          }
        } else if (isBoolean) {
          if (!checkPrefixed(name)) {
            report({
              node: pattern,
              message: `boolean variable '${name}' must be prefixed is/has/can/should`
            });
          }
        } else if (kind != null && isGlobalConst) {
          if (!UPPER.test(name)) {
            report({
              node: pattern,
              message: `global const ${kind} '${name}' must be UPPER_CASE`
            });
          }
        } else if (isGlobalConst) {
          if (
            !checkFormats({
              name,
              formats: ["camelCase", "UPPER_CASE", "PascalCase"]
            })
          ) {
            report({
              node: pattern,
              message: `global const '${name}' must be camelCase, UPPER_CASE or PascalCase`
            });
          }
        } else if (!CAMEL.test(name)) {
          report({
            node: pattern,
            message: `variable '${name}' must be camelCase`
          });
        }
      }
    }

    function checkTypeName({ id, formats, label }) {
      const hasInvalidTypeName =
        id &&
        !checkFormats({
          name: id.name,
          formats
        });
      if (hasInvalidTypeName) {
        report({
          node: id,
          message: `${label} '${id.name}' must be ${formats.join(" or ")}`
        });
      }
    }

    return {
      Program(node) {
        program = node;
        booleanFunctions = collectBooleanFunctions(node);
      },
      VariableDeclarator: checkVariable,
      FunctionDeclaration(node) {
        const hasInvalidFunctionName = node.id && !CAMEL.test(node.id.name);
        if (hasInvalidFunctionName) {
          report({
            node: node.id,
            message: `function '${node.id.name}' must be camelCase`
          });
        }

        checkFunctionParams(node);
      },
      FunctionExpression: checkFunctionParams,
      ArrowFunctionExpression: checkFunctionParams,
      TSDeclareFunction: checkFunctionParams,
      PropertyDefinition(node) {
        checkMember({
          node,
          selectorName: "classProperty"
        });
      },
      MethodDefinition(node) {
        const isNotConstructor = node.kind !== "constructor";
        if (isNotConstructor) {
          const isAccessor = node.kind === "get" || node.kind === "set";
          checkMember({
            node,
            selectorName: isAccessor ? "accessor" : "classMethod"
          });
        }
      },
      TSPropertySignature(node) {
        checkMember({
          node,
          selectorName: "typeProperty"
        });
      },
      Property(node) {
        const isObjectLiteralMember = node.parent?.type === "ObjectExpression";
        if (isObjectLiteralMember) {
          const isFunctionValue =
            node.method || node.value?.type === "ArrowFunctionExpression" || node.value?.type === "FunctionExpression";
          const isEnumMember =
            !isFunctionValue &&
            isEnumLike({
              objectExpression: node.parent,
              program
            });
          const formats = isEnumMember ? ["UPPER_CASE"] : ["camelCase", "UPPER_CASE", "PascalCase"];
          checkMember({
            node,
            selectorName: isFunctionValue ? "objectLiteralMethod" : "objectLiteralProperty",
            formats: isFunctionValue ? ["camelCase", "UPPER_CASE"] : formats
          });
        }
      },
      TSEnumMember(node) {
        const name = node.id.type === "Identifier" ? node.id.name : node.id.value;
        if (!UPPER.test(name)) {
          report({
            node: node.id,
            message: `enumMember '${name}' must be UPPER_CASE`
          });
        }
      },
      TSInterfaceDeclaration(node) {
        checkTypeName({
          id: node.id,
          formats: ["PascalCase"],
          label: "interface"
        });

        if (/^I[A-Z]/.test(node.id.name)) {
          report({
            node: node.id,
            message: `interface '${node.id.name}' must not start with I`
          });
        }
      },
      ClassDeclaration(node) {
        checkTypeName({
          id: node.id,
          formats: ["PascalCase"],
          label: "class"
        });
      },
      ClassExpression(node) {
        checkTypeName({
          id: node.id,
          formats: ["PascalCase"],
          label: "class"
        });
      },
      TSTypeAliasDeclaration(node) {
        checkTypeName({
          id: node.id,
          formats: ["PascalCase"],
          label: "typeAlias"
        });
      },
      TSEnumDeclaration(node) {
        checkTypeName({
          id: node.id,
          formats: ["PascalCase"],
          label: "enum"
        });
      },
      TSTypeParameter(node) {
        const name = typeof node.name === "string" ? node.name : node.name.name;
        if (!PASCAL.test(name)) {
          report({
            node,
            message: `typeParameter '${name}' must be PascalCase`
          });
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
