declare namespace JSX {
  interface Element {
    readonly __brand: 'JSX.Element'
  }
  interface ElementChildrenAttribute {
    children: object
  }
  interface IntrinsicElements {
    div: { children?: unknown }
    button: { onClick?: () => void; children?: unknown }
  }
}
