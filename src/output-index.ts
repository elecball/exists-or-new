type Node = {children:Map<bigint, Node>; entryId:number | null};
const node = ():Node => ({children:new Map(), entryId:null});
/** Exact integer coordinates are BigInt keys; no floating point, expression text, or hash collisions. */
export class ExactOutputIndex {
  private root = node();
  add(outputs:readonly bigint[], entryId:number) {
    let current = this.root;
    for (const component of outputs) {
      let next = current.children.get(component);
      if (!next) {next = node(); current.children.set(component, next);}
      current = next;
    }
    current.entryId ??= entryId;
  }
  find(outputs:readonly bigint[]):number | null {
    let current = this.root;
    for (const component of outputs) {
      const next = current.children.get(component);
      if (!next) return null;
      current = next;
    }
    return current.entryId;
  }
}
