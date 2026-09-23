import { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Express 4 does not await rejected promises; wrap every registered route, including nested routers. */
export function wrapRouter(router: { stack?: Array<any> }) {
  for (const layer of router.stack || []) {
    if (layer.route?.stack) {
      for (const routeLayer of layer.route.stack) routeLayer.handle = asyncHandler(routeLayer.handle);
    } else if (layer.handle?.stack) {
      wrapRouter(layer.handle);
    }
  }
  return router;
}
