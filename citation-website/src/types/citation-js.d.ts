declare module "citation-js" {
  class Cite {
    constructor(data?: any, options?: any);
    data: any[];
    format(
      type: string,
      options?: { format?: string; template?: string; lang?: string }
    ): string;
    get(options?: any): any;
    static async(data?: any, options?: any): Promise<Cite>;
    static validateType(type: string): boolean;
  }
  export default Cite;
}
