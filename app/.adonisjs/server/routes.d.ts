import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'tanks.index': { paramsTuple?: []; params?: {} }
    'tanks.store': { paramsTuple?: []; params?: {} }
    'tanks.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'tanks.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'tanks.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  GET: {
    'tanks.index': { paramsTuple?: []; params?: {} }
    'tanks.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  HEAD: {
    'tanks.index': { paramsTuple?: []; params?: {} }
    'tanks.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  POST: {
    'tanks.store': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'tanks.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'tanks.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}