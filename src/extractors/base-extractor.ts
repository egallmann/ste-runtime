export interface FunctionDef {
  name: string;
  lineno: number;
  end_lineno: number;
  args: string[];
  returns?: string;
  decorators: string[];
  docstring?: string;
  async: boolean;
}

export interface ClassDef {
  name: string;
  lineno: number;
  end_lineno: number;
  bases: string[];
  methods: FunctionDef[];
  docstring?: string;
}

export interface Import {
  module: string;
  names: string[];
  alias?: string;
}

export interface APIEndpoint {
  framework: 'flask' | 'fastapi' | string;
  method: string;
  path: string;
  function_name: string;
  lineno: number;
  docstring?: string;
}

export interface Field {
  name: string;
  type?: string;
  default?: string;
}

export interface DataModel {
  name: string;
  fields: Field[];
  lineno: number;
  docstring?: string;
}

export interface ExtractedStructure {
  filepath: string;
  language: 'python';
  functions: FunctionDef[];
  classes: ClassDef[];
  imports: Import[];
  api_endpoints: APIEndpoint[];
  data_models: DataModel[];
}

export abstract class BaseExtractor {
  abstract canHandle(filePath: string): boolean;

  abstract extractFile(filePath: string): Promise<ExtractedStructure[]>;

  abstract extractProject(projectRoot: string): Promise<ExtractedStructure[]>;
}

