import type {Rational} from './math.ts';
type Node = {children:Map<bigint, Node>; entryId:number | null};
const node = ():Node => ({children:new Map(), entryId:null});
/** Exact rational coordinates are BigInt keys; no floating point, expression text, or hash collisions. */
export class ExactOutputIndex {
  private root = node();
  add(outputs:readonly Rational[], entryId:number) {
    let current = this.root;
    for (const value of outputs) for (const component of [value.n, value.d]) {
      let next = current.children.get(component);
      if (!next) {next = node(); current.children.set(component, next);}
      current = next;
    }
    current.entryId ??= entryId;
  }
  find(outputs:readonly Rational[]):number | null {
    let current = this.root;
    for (const value of outputs) for (const component of [value.n, value.d]) {
      const next = current.children.get(component);
      if (!next) return null;
      current = next;
    }
    return current.entryId;
  }
}
