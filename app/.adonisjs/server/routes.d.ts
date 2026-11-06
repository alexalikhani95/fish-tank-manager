import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'auth.register': { paramsTuple?: []; params?: {} }
    'auth.login': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'me.show': { paramsTuple?: []; params?: {} }
    'me.update': { paramsTuple?: []; params?: {} }
    'tanks.index': { paramsTuple?: []; params?: {} }
    'tanks.store': { paramsTuple?: []; params?: {} }
    'tanks.show': { paramsTuple: [ParamValue]; params: {'tankId': ParamValue} }
    'tanks.update': { paramsTuple: [ParamValue]; params: {'tankId': ParamValue} }
    'tanks.destroy': { paramsTuple: [ParamValue]; params: {'tankId': ParamValue} }
  }
  GET: {
    'me.show': { paramsTuple?: []; params?: {} }
    'tanks.index': { paramsTuple?: []; params?: {} }
    'tanks.show': { paramsTuple: [ParamValue]; params: {'tankId': ParamValue} }
  }
  HEAD: {
    'me.show': { paramsTuple?: []; params?: {} }
    'tanks.index': { paramsTuple?: []; params?: {} }
    'tanks.show': { paramsTuple: [ParamValue]; params: {'tankId': ParamValue} }
  }
  POST: {
    'auth.register': { paramsTuple?: []; params?: {} }
    'auth.login': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'tanks.store': { paramsTuple?: []; params?: {} }
  }
  PATCH: {
    'me.update': { paramsTuple?: []; params?: {} }
    'tanks.update': { paramsTuple: [ParamValue]; params: {'tankId': ParamValue} }
  }
  DELETE: {
    'tanks.destroy': { paramsTuple: [ParamValue]; params: {'tankId': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}