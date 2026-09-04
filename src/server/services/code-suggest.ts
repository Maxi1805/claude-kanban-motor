/**
 * suggest.ts
 * ----------------------------------------------------------------------------
 * Mapeo FUNDAMENTADO (no arbitrario) entre un hallazgo de un analizador
 * tree-sitter y la solución recomendada (refactorización de Martin Fowler
 * y/o patrón de diseño GoF), con la URL de la fuente que lo respalda.
 *
 * Ver mapeo.md (mismo directorio) para el detalle de cada fuente y la
 * justificación completa. Resumen de las reglas de decisión aplicadas:
 *
 *  - DUPLICACIÓN: la solución depende de si las copias están en la misma
 *    función, en la misma clase (o clases con el mismo `extends` textual),
 *    o dispersas; y de si el código es idéntico o solo estructuralmente
 *    similar. Fuente: refactoring.guru/es/smells/duplicate-code.
 *  - CADENA DE CONDICIONALES: la solución depende de la cantidad de ramas,
 *    de si alguna rama compara contra null, de si las ramas instancian
 *    tipos distintos (caso Factory Method, a IGNORAR según la fuente) y
 *    de si el discriminante es un campo mutable (State) o fijo (Strategy).
 *    NO existe ningún umbral de "ramas" que dispare Factory Method en
 *    ninguna fuente consultada. Fuente: refactoring.guru/es/smells/switch-statements.
 *  - COMPLEJIDAD ALTA: nunca se recomienda un patrón de diseño como
 *    solución primaria; siempre es una refactorización mecánica.
 *    Fuente: regla SonarSource S3776 (Cognitive Complexity).
 *  - FUNCIÓN LARGA: Extract Method es la solución (nunca Facade).
 *    Fuente: refactoring.guru/es/smells/long-method.
 *
 * Postura de diseño (ver mapeo.md sección 5 y 6): esta función SIEMPRE
 * devuelve una refactorización concreta y segura como `primary`. El
 * patrón de diseño, cuando la señal disponible lo sugiere, se devuelve
 * por separado en `conditionalPattern` con un `caveat` explícito sobre
 * qué señal adicional (fuera del alcance de un analizador tree-sitter
 * sin resolución de tipos/herencia) haría falta para confirmarlo. Esto
 * es deliberado: sugerir un patrón como mandato sin poder verificar sus
 * precondiciones es la puerta de entrada a la sobre-ingeniería (ver
 * mapeo.md sección 6). Ninguna herramienta madura (SonarQube) sugiere
 * patrones de diseño en su remediación por defecto; esta función tampoco
 * lo hace: los patrones viajan siempre acompañados de la refactorización
 * seye y marcados como condicionados.
 *
 * Sin dependencias externas. Determinista: misma entrada -> misma salida.
 * ----------------------------------------------------------------------------
 */

// ============================================================================
// Tipos de entrada: lo que un analizador tree-sitter puede conocer SIN
// resolver tipos ni herencia real (todo lo de abajo es sintáctico: se
// obtiene caminando el AST, no consultando un sistema de tipos).
// ============================================================================

/** Ubicación de una ocurrencia (archivo + rango de líneas). */
export interface CodeLocation {
  file: string;
  startLine: number;
  endLine: number;
}

/**
 * Señales medibles para un hallazgo de DUPLICACIÓN.
 * Todas las copias detectadas viven en `locations` (>= 2).
 */
export interface DuplicationContext {
  locations: CodeLocation[];

  /**
   * true si el texto de todas las copias es idéntico (tras normalizar
   * espacios en blanco); false si solo son estructuralmente similares
   * (mismo "shape" de AST, distintos literales/identificadores).
   */
  identicalText: boolean;

  /**
   * Nombre del nodo función/método que contiene cada copia, en el mismo
   * orden que `locations`. `null` si la copia no está dentro de ninguna
   * función (código a nivel de módulo).
   */
  containingFunctionNames: (string | null)[];

  /**
   * Nombre del nodo `class`/`struct` que contiene cada copia (contención
   * SINTÁCTICA: subir por los padres del AST hasta encontrar un nodo de
   * clase; esto NO requiere resolver tipos). `null` si no hay clase
   * envolvente.
   */
  enclosingClassNames: (string | null)[];

  /**
   * Identificador textual tal cual aparece en la cláusula `extends`/
   * `implements`/herencia del nodo de clase envolvente de cada copia
   * (ej. "Animal"). Es una lectura literal del AST, NO una resolución
   * real de herencia (dos clases podrían escribir "Animal" y referirse
   * a símbolos distintos; el analizador no lo puede saber). `null` si
   * la clase no declara herencia o no hay clase envolvente.
   */
  enclosingSuperclassNames: (string | null)[];

  /**
   * true si TODAS las copias son ramas de un mismo nodo condicional
   * (mismo `if`/`switch`), es decir, duplicación intra-condicional.
   */
  sameEnclosingConditional: boolean;
}

/** Tipo de discriminante detectado sintácticamente en un condicional. */
export type DiscriminantKind =
  | "nullCheck" // alguna rama compara explícitamente contra null/undefined/None
  | "mutableField" // discriminante = this.x/self.x, reasignado en >=2 métodos de la clase
  | "fixedValue" // discriminante = parámetro o campo nunca reasignado (constante para la vida del objeto)
  | "unknown"; // no se pudo determinar con las señales disponibles

/** Señales medibles para un hallazgo de CADENA DE CONDICIONALES. */
export interface ConditionalChainContext {
  /** Cantidad de ramas del if-else/switch (incluye default/else). */
  branchCount: number;

  /** Tipo de discriminante, ver DiscriminantKind. */
  discriminantKind: DiscriminantKind;

  /**
   * true si el cuerpo dominante de CADA rama es una construcción de
   * objeto (`new Tipo(...)` o `return new Tipo(...)`) con un tipo
   * distinto por rama. Señal puramente sintáctica (se detecta contando
   * expresiones `new` en el cuerpo de cada rama).
   */
  branchesInstantiateDistinctTypes: boolean;

  /**
   * true si todas las ramas invocan el mismo método/función, solo con
   * argumentos explícitos distintos.
   */
  branchesCallSameMethodWithDifferentArgs: boolean;
}

/** Qué factor domina la métrica de complejidad que disparó el hallazgo. */
export type ComplexityDriver =
  | "nesting" // anidamiento profundo de bloques
  | "booleanExpression" // condiciones con muchos && / || encadenados
  | "branchCount" // muchos if/else-if que no forman un switch sobre un tipo
  | "unknown";

/** Señales medibles para un hallazgo de COMPLEJIDAD ALTA. */
export interface HighComplexityContext {
  metric: "cyclomatic" | "cognitive" | "nestingDepth";
  value: number;
  threshold: number;
  dominantDriver: ComplexityDriver;
}

/** Señales medibles para un hallazgo de FUNCIÓN LARGA. */
export interface LongFunctionContext {
  lineCount: number;
  threshold: number;
  containsLoop: boolean;
  /** Cantidad de parámetros de la función, si el analizador la captura. */
  parameterCount?: number;
}

/** Unión discriminada de todos los hallazgos que puede reportar el analizador. */
export type Finding =
  | { type: "duplication"; context: DuplicationContext }
  | { type: "conditional_chain"; context: ConditionalChainContext }
  | { type: "high_complexity"; context: HighComplexityContext }
  | { type: "long_function"; context: LongFunctionContext };

// ============================================================================
// Tipos de salida
// ============================================================================

export type SuggestionKind = "refactorizacion" | "patron_de_diseno";

export interface Suggestion {
  /** Nombre de la técnica o patrón (en el idioma en que la nombra la fuente). */
  name: string;
  kind: SuggestionKind;
  /** Por qué se recomienda, en una línea. */
  why: string;
  /** URL de la fuente que respalda esta recomendación. */
  source: string;
  /**
   * Si existe más de una técnica válida para el mismo contexto según la
   * fuente (ej. Form Template Method vs. Substitute Algorithm), se listan
   * aquí como alternativas igualmente fundamentadas.
   */
  alternatives?: Suggestion[];
  /**
   * Presente únicamente cuando `kind === "patron_de_diseno"`: qué señal
   * adicional (fuera del alcance del analizador actual) haría falta para
   * confirmar con certeza que el patrón aplica. Ver mapeo.md sección 6:
   * un patrón nunca se prescribe como mandato sin esta advertencia.
   */
  caveat?: string;
}

export interface SuggestionResult {
  /** Refactorización concreta y segura: siempre presente, sin condiciones. */
  primary: Suggestion;
  /**
   * Patrón de diseño hacia el que converge la refactorización, SOLO si la
   * señal disponible lo sostiene razonablemente. Ausente cuando ninguna
   * fuente vincula el hallazgo con un patrón (ej. función larga, o
   * complejidad alta genérica).
   */
  conditionalPattern?: Suggestion;
}

// ============================================================================
// Constantes citadas (para no tener "números mágicos" sin fuente, al
// contrario del ">=8 ramas" original que no tenía respaldo).
// ============================================================================

/** Sonar S1301: "'switch' statements should have at least 3 case clauses". */
const MIN_BRANCHES_FOR_SWITCH_SMELL = 3;

// ============================================================================
// URLs de fuente, centralizadas para evitar typos / inconsistencias.
// ============================================================================

const SRC = {
  duplicateCode: "https://refactoring.guru/es/smells/duplicate-code",
  longMethod: "https://refactoring.guru/es/smells/long-method",
  switchStatements: "https://refactoring.guru/es/smells/switch-statements",
  replaceConditionalWithPolymorphism:
    "https://refactoring.com/catalog/replaceConditionalWithPolymorphism.html",
  introduceSpecialCase: "https://refactoring.com/catalog/introduceSpecialCase.html",
  replaceTypeCodeWithStateStrategy:
    "https://refactoring.guru/replace-type-code-with-state-strategy",
  statePattern: "https://refactoring.guru/es/design-patterns/state",
  strategyPattern: "https://refactoring.guru/es/design-patterns/strategy",
  facadePattern: "https://refactoring.guru/es/design-patterns/facade",
  sonarCognitiveComplexity:
    "https://rules.sonarsource.com/typescript/RSPEC-3776/",
  sonarSwitchTooFewBranches: "https://rules.sonarsource.com/typescript/RSPEC-1301/",
} as const;

// ============================================================================
// 1. DUPLICACIÓN
// ============================================================================

function suggestForDuplication(ctx: DuplicationContext): SuggestionResult {
  const { locations, identicalText, containingFunctionNames, enclosingClassNames, enclosingSuperclassNames, sameEnclosingConditional } = ctx;

  if (locations.length < 2) {
    // No debería ocurrir (duplicación requiere >=2 copias), pero se
    // documenta el caso límite en vez de asumir silenciosamente.
    throw new Error("DuplicationContext requiere al menos 2 ubicaciones");
  }

  // Caso 1: todas las copias son ramas del mismo condicional.
  if (sameEnclosingConditional) {
    return {
      primary: {
        name: "Consolidate Duplicate Conditional Fragments",
        kind: "refactorizacion",
        why: "el código repetido está en todas las ramas de un mismo condicional; se saca fuera del árbol condicional",
        source: SRC.duplicateCode,
      },
    };
  }

  // Caso 2: todas las copias están en el mismo nodo función.
  const allSameFunction =
    containingFunctionNames.every((n) => n !== null) &&
    containingFunctionNames.every((n) => n === containingFunctionNames[0]) &&
    // además deben ser, de hecho, la misma ubicación de función (mismo archivo);
    // el nombre solo no alcanza si son archivos distintos con funciones homónimas.
    locations.every((l) => l.file === locations[0].file);

  if (allSameFunction) {
    return {
      primary: {
        name: "Extract Method",
        kind: "refactorizacion",
        why: "las copias están dentro de la misma función; se extrae el bloque repetido y se llama desde ambos puntos",
        source: SRC.duplicateCode,
      },
    };
  }

  // Caso 3: mismo nodo de clase envolvente en todas las copias (misma clase,
  // funciones distintas) — señal sintáctica: mismo archivo + mismo nombre
  // de clase envolvente.
  const allSameClass =
    enclosingClassNames.every((c) => c !== null) &&
    enclosingClassNames.every((c) => c === enclosingClassNames[0]) &&
    locations.every((l) => l.file === locations[0].file);

  // Caso 4: clases distintas pero con el mismo identificador textual en
  // `extends` (aproximación sintáctica a "subclases hermanas", sin
  // resolver herencia real).
  const allShareSuperclassText =
    !allSameClass &&
    enclosingSuperclassNames.every((s) => s !== null) &&
    enclosingSuperclassNames.every((s) => s === enclosingSuperclassNames[0]);

  if (allSameClass || allShareSuperclassText) {
    if (identicalText) {
      const primary: Suggestion = {
        name: allSameClass ? "Extract Method" : "Extract Method + Pull Up Field / Pull Up Constructor Body",
        kind: "refactorizacion",
        why: allSameClass
          ? "las copias son idénticas y están en la misma clase; se extrae el método y se llama desde ambos sitios"
          : "las copias son idénticas y las clases comparten superclase textual; se extrae en ambas y se sube el método/campo compartido",
        source: SRC.duplicateCode,
      };
      return { primary };
    }
    // Similar pero NO idéntico: el catálogo distingue explícitamente este
    // caso y ofrece dos técnicas válidas según la causa de la diferencia.
    return {
      primary: {
        name: "Form Template Method",
        kind: "refactorizacion",
        why: "el código es estructuralmente similar pero no idéntico en clases del mismo nivel; el resultado es un Template Method",
        source: SRC.duplicateCode,
        alternatives: [
          {
            name: "Substitute Algorithm",
            kind: "refactorizacion",
            why: "alternativa si, tras revisión humana, ambas copias son en realidad algoritmos distintos que logran el mismo resultado (esto no es detectable solo por forma de AST)",
            source: SRC.duplicateCode,
          },
        ],
      },
      conditionalPattern: {
        name: "Template Method",
        kind: "patron_de_diseno",
        why: "es el resultado nombrado de aplicar Form Template Method sobre pasos similares con detalles distintos",
        source: SRC.duplicateCode,
        caveat:
          "se asume que ambas clases pertenecen a la misma jerarquía porque comparten el texto de `extends`; sin un resolvedor de tipos no se puede confirmar que sea la MISMA superclase real",
      },
    };
  }

  // Caso 5: sin relación textual conocida (archivos dispersos, sin
  // superclase compartida, o incluso funciones/clases distintas sin
  // relación aparente). Default conservador: Extract Class.
  return {
    primary: {
      name: "Extract Class",
      kind: "refactorizacion",
      why: "las copias están en clases o archivos sin relación textual conocida; se crea un componente nuevo y se usa desde ambas",
      source: SRC.duplicateCode,
      alternatives: [
        {
          name: "Extract Superclass",
          kind: "refactorizacion",
          why: "alternativa si un revisor humano confirma que ambas clases podrían generalizarse bajo una superclase común (esto requiere resolución de tipos/herencia que el analizador no tiene)",
          source: SRC.duplicateCode,
        },
      ],
    },
  };
}

// ============================================================================
// 2. CADENA DE CONDICIONALES
// ============================================================================

function suggestForConditionalChain(ctx: ConditionalChainContext): SuggestionResult {
  const { branchCount, discriminantKind, branchesInstantiateDistinctTypes, branchesCallSameMethodWithDifferentArgs } = ctx;

  // Menos de 3 ramas: según Sonar S1301, ni siquiera es un smell de switch.
  if (branchCount < MIN_BRANCHES_FOR_SWITCH_SMELL) {
    return {
      primary: {
        name: "Simplificar el condicional (if/else simple)",
        kind: "refactorizacion",
        why: `con menos de ${MIN_BRANCHES_FOR_SWITCH_SMELL} ramas no hay evidencia de que un switch/cadena de condicionales sea un problema en sí mismo`,
        source: SRC.sonarSwitchTooFewBranches,
      },
    };
  }

  // Alguna rama compara contra null: caso explícito de la fuente.
  if (discriminantKind === "nullCheck") {
    return {
      primary: {
        name: "Introduce Special Case (Introduce Null Object)",
        kind: "refactorizacion",
        why: "una de las ramas del condicional compara explícitamente contra null; se reemplaza por un objeto que representa ese caso especial",
        source: SRC.switchStatements,
      },
      conditionalPattern: {
        name: "Null Object",
        kind: "patron_de_diseno",
        why: "es el nombre con el que Fowler (2ª ed.) identifica el resultado de Introduce Special Case cuando el caso especial es la ausencia de valor",
        source: SRC.introduceSpecialCase,
      },
    };
  }

  // Todas las ramas llaman al mismo método con distintos argumentos.
  if (branchesCallSameMethodWithDifferentArgs) {
    return {
      primary: {
        name: "Replace Parameter with Explicit Methods",
        kind: "refactorizacion",
        why: "todas las ramas invocan el mismo método variando solo los argumentos explícitos",
        source: SRC.switchStatements,
      },
    };
  }

  // Cada rama instancia un tipo distinto: la fuente pide IGNORAR este caso,
  // no refactorizarlo hacia polimorfismo, porque ya es la forma legítima de
  // un Factory Method / Abstract Factory.
  if (branchesInstantiateDistinctTypes) {
    return {
      primary: {
        name: "No refactorizar (dejar como está)",
        kind: "refactorizacion",
        why: "cada rama construye un objeto de un tipo distinto: es el uso legítimo de un switch dentro de un Factory Method/Abstract Factory, no un smell a resolver con polimorfismo",
        source: SRC.switchStatements,
      },
      conditionalPattern: {
        name: "Factory Method / Abstract Factory",
        kind: "patron_de_diseno",
        why: "el switch ya cumple el rol de selector de tipo a construir que estos patrones formalizan",
        source: SRC.switchStatements,
        caveat:
          "el disparador correcto es que el CUERPO de cada rama sea una construcción de objeto, no la cantidad de ramas (no existe umbral de ramas en ninguna fuente consultada)",
      },
    };
  }

  // Caso general: discriminante fijo o desconocido, sin señal de tipo-código
  // dinámico. Primero, un paso siempre seguro: aislar el switch.
  const primary: Suggestion = {
    name: "Extract Method + Move Method",
    kind: "refactorizacion",
    why: "aísla el switch en su propio método (y en la clase correcta) como paso previo, seguro con las señales disponibles hoy",
    source: SRC.switchStatements,
  };

  // Mecánica general (Fowler) hacia la que convergen tanto Strategy/State
  // como Replace Type Code with Subclasses: se ofrece siempre como
  // alternativa "de proceso", separada del patrón concreto (que es una
  // hipótesis, no un hecho confirmado con las señales disponibles).
  const polymorphismMechanics: Suggestion = {
    name: "Replace Conditional with Polymorphism",
    kind: "refactorizacion",
    why: "es la mecánica general de Fowler que formaliza el paso de condicional a jerarquía de tipos, sea cual sea el patrón concreto de destino",
    source: SRC.replaceConditionalWithPolymorphism,
  };

  if (discriminantKind === "mutableField") {
    return {
      primary,
      conditionalPattern: {
        name: "State",
        kind: "patron_de_diseno",
        why: "el discriminante es un campo que se reasigna en varios métodos de la clase, es decir, representa el estado del objeto a lo largo de su vida",
        source: SRC.statePattern,
        alternatives: [polymorphismMechanics],
        caveat:
          "se infiere 'estado' porque el campo se reasigna en >=2 métodos; para confirmar que amerita State (y no solo un flag booleano puntual) hace falta criterio humano sobre cuántos comportamientos distintos dependen de ese campo",
      },
    };
  }

  // discriminantKind === "fixedValue" | "unknown"
  return {
    primary,
    conditionalPattern: {
      name: "Strategy",
      kind: "patron_de_diseno",
      why: "el discriminante no muestra señales de mutación; si solo elige cómo ejecutar una misma operación, el destino natural es Strategy",
      source: SRC.strategyPattern,
      alternatives: [polymorphismMechanics],
      caveat:
        "confirmar esto (en vez de, por ejemplo, Replace Type Code with Subclasses) requiere saber si ya existe o conviene una jerarquía de clases, algo que un analizador sin resolución de tipos no puede verificar; tratar como hipótesis, no como mandato",
    },
  };
}

// ============================================================================
// 3. COMPLEJIDAD ALTA
// ============================================================================

function suggestForHighComplexity(ctx: HighComplexityContext): SuggestionResult {
  switch (ctx.dominantDriver) {
    case "nesting":
      return {
        primary: {
          name: "Replace Nested Conditional with Guard Clauses",
          kind: "refactorizacion",
          why: "la complejidad está dominada por anidamiento profundo; los retornos tempranos aplanan la estructura",
          source: SRC.sonarCognitiveComplexity,
        },
      };
    case "booleanExpression":
      return {
        primary: {
          name: "Consolidate Conditional Expression + Extract Variable",
          kind: "refactorizacion",
          why: "la complejidad está dominada por condiciones booleanas compuestas; se nombran y se consolidan",
          source: SRC.sonarCognitiveComplexity,
        },
      };
    case "branchCount":
      return {
        primary: {
          name: "Decompose Conditional",
          kind: "refactorizacion",
          why: "hay muchas ramas de condicional (sin ser un único switch sobre un tipo); se descompone cada condición/rama en su propio método",
          source: SRC.longMethod,
        },
      };
    case "unknown":
    default:
      return {
        primary: {
          name: "Extract Method",
          kind: "refactorizacion",
          why: "sin un driver dominante identificable, dividir la función en piezas más pequeñas es la recomendación genérica de la fuente",
          source: SRC.sonarCognitiveComplexity,
        },
      };
  }
  // Nota deliberada: esta función NUNCA devuelve `conditionalPattern`.
  // Ninguna fuente consultada (refactoring.guru, Fowler, SonarQube S3776)
  // vincula "complejidad alta" en general con un patrón de diseño. El
  // caso "Strategy" solo es válido cuando el driver es, específicamente,
  // un condicional que selecciona variantes de un algoritmo — eso se
  // modela como hallazgo `conditional_chain`, no aquí.
}

// ============================================================================
// 4. FUNCIÓN LARGA
// ============================================================================

function suggestForLongFunction(ctx: LongFunctionContext): SuggestionResult {
  const alternatives: Suggestion[] = [];

  if (ctx.containsLoop) {
    alternatives.push({
      name: "Extract Method (cuerpo del loop)",
      kind: "refactorizacion",
      why: "cuando un loop complejo está en el camino de la extracción, se extrae primero su cuerpo",
      source: SRC.longMethod,
    });
  }

  if (ctx.parameterCount !== undefined && ctx.parameterCount > 4) {
    alternatives.push({
      name: "Introduce Parameter Object",
      kind: "refactorizacion",
      why: "muchos parámetros dificultan extraer métodos; agruparlos en un objeto lo habilita",
      source: SRC.longMethod,
    });
  }

  return {
    primary: {
      name: "Extract Method",
      kind: "refactorizacion",
      why: "es la técnica por defecto y siempre aplicable para un método largo",
      source: SRC.longMethod,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    },
  };
  // Nota deliberada: NUNCA se sugiere Facade. Facade es un patrón
  // estructural para simplificar el acceso a un subsistema de MÚLTIPLES
  // CLASES (ver SRC.facadePattern en mapeo.md); no tiene relación con
  // acortar un único método largo. Tampoco se sugiere ningún otro patrón:
  // ninguna fuente consultada vincula Long Method con un patrón de diseño.
}

// ============================================================================
// Función pública
// ============================================================================

/**
 * Dado un hallazgo (tipo de problema + contexto medido por el analizador
 * tree-sitter), devuelve la sugerencia fundamentada: una refactorización
 * concreta siempre presente, y opcionalmente un patrón de diseño
 * condicionado cuando la señal disponible lo sostiene.
 *
 * Determinista: la misma entrada siempre produce la misma salida (no hay
 * aleatoriedad, IO, ni dependencia del reloj).
 */
export function suggest(finding: Finding): SuggestionResult {
  switch (finding.type) {
    case "duplication":
      return suggestForDuplication(finding.context);
    case "conditional_chain":
      return suggestForConditionalChain(finding.context);
    case "high_complexity":
      return suggestForHighComplexity(finding.context);
    case "long_function":
      return suggestForLongFunction(finding.context);
    default: {
      // Chequeo exhaustivo en tiempo de compilación: si se agrega un nuevo
      // tipo de Finding y no se lo maneja arriba, esto no compila.
      const _exhaustive: never = finding;
      throw new Error(`Tipo de hallazgo no soportado: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
