
import { Observable, OperatorFunction, of, ObservableInput, from } from 'rxjs';
import { map, concatAll, concatMap, toArray } from 'rxjs/operators';

export namespace PathCommand {
  export const enum Type {
    LINE = 'L',
    QUADRATIC_CURVE = 'Q',
    CUBIC_CURVE = 'C',
    ARC = 'A',
  }

  export interface Point {
    readonly x: number;
    readonly y: number;
  }

  export interface PointTransformer {
    transformPoint(pt: Point): Point;
  }
  
  export interface Line {
    readonly type: Type.LINE;
    readonly controlPoints?: [];
    readonly toPoint: Point;
  }

  export interface QuadraticCurve {
    readonly type: Type.QUADRATIC_CURVE;
    readonly controlPoints: readonly [Point];
    readonly toPoint: Point;
  }

  export interface CubicCurve {
    readonly type: Type.CUBIC_CURVE;
    readonly controlPoints: readonly [Point, Point];
    readonly toPoint: Point;
  }

  export interface Arc {
    readonly type: Type.ARC;
    readonly radiusX: number;
    readonly radiusY: number;
    readonly rotateDegrees: number;
    readonly largeArcFlag?: boolean;
    readonly sweepFlag?: boolean;  
    readonly toPoint: Point;
  }
}

export type PathCommand = PathCommand.Line | PathCommand.QuadraticCurve | PathCommand.CubicCurve | PathCommand.Arc;

export interface SubPath<TCommand extends PathCommand = PathCommand> {
  readonly startPoint: PathCommand.Point;
  readonly commands: ObservableInput<TCommand>;
  readonly closed?: boolean;
  readonly svgPathData?: string;
}

export function pathCommandToString(cmd: PathCommand): string {
  const p = cmd.toPoint;
  switch (cmd.type) {
    case PathCommand.Type.LINE: {
      return `L${p.x},${p.y}`;
    }
    case PathCommand.Type.QUADRATIC_CURVE: {
      const [c] = cmd.controlPoints;
      return `Q${c.x},${c.y} ${p.x},${p.y}`;
    }
    case PathCommand.Type.CUBIC_CURVE: {
      const [c1, c2] = cmd.controlPoints;
      return `C${c1.x},${c1.y} ${c2.x},${c2.y} ${p.x},${p.y}`;
    }
    case PathCommand.Type.ARC: {
      return `A${cmd.radiusX} ${cmd.radiusY} ${cmd.rotateDegrees} ${cmd.largeArcFlag?1:0} ${cmd.sweepFlag?1:0} ${p.x},${p.y}`;
    }
  }
}

export function toSVGPathData(): OperatorFunction<SubPath, string> {
  return input => input.pipe(
    map(subPath => {
      const { svgPathData } = subPath;
      if (typeof svgPathData === 'string') return of(svgPathData);
      return new Observable<string>(subscriber => {
        subscriber.next(`M${subPath.startPoint.x},${subPath.startPoint.y}`);
        return from(subPath.commands).subscribe(
          cmd => { subscriber.next(pathCommandToString(cmd)); },
          e => subscriber.error(e),
          () => {
            if (subPath.closed) subscriber.next('Z');
            subscriber.complete();
          }
        );
      });
    }),
    concatAll(),
  );
}

function pathCommands(startPoint: PathCommand.Point, input: Observable<string>): Observable<PathCommand> {
  let lastPoint = startPoint;
  let qMirror = lastPoint;
  let cMirror = lastPoint;
  return new Observable(subscriber => {
    const onCompleteCommand = (cmdString: string) => {
      const match = cmdString.match(/^\s*([a-df-z])\s*((?!\s)[^a-df-z]+)?$/i)!;
      const commandCode = match[1], commandParameters = match[2] ? match[2].trim().split(/\s*,\s*|\s+/g).map(parseFloat) : [];
      switch (commandCode) {
        case 'L': {
          if (commandParameters.length < 2 || commandParameters.length % 2) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 2) {
            lastPoint = {x: commandParameters[i], y: commandParameters[i+1]};
            subscriber.next({type:PathCommand.Type.LINE, toPoint:lastPoint});
          }
          qMirror = cMirror = lastPoint;
          return;
        }
        case 'l': {
          if (commandParameters.length < 2 || commandParameters.length % 2) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 2) {
            lastPoint = {x: lastPoint.x + commandParameters[i], y: lastPoint.y + commandParameters[i+1]};
            subscriber.next({type:PathCommand.Type.LINE, toPoint:lastPoint});
          }
          qMirror = cMirror = lastPoint;
          return;
        }
        case 'H': {
          if (commandParameters.length < 1) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i++) {
            lastPoint = {x: commandParameters[i], y: lastPoint.y};
            subscriber.next({type:PathCommand.Type.LINE, toPoint:lastPoint});
          }
          qMirror = cMirror = lastPoint;
          return;
        }
        case 'h': {
          if (commandParameters.length < 1) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i++) {
            lastPoint = {x: lastPoint.x + commandParameters[i], y: lastPoint.y};
            subscriber.next({type:PathCommand.Type.LINE, toPoint:lastPoint});
          }
          qMirror = cMirror = lastPoint;
          return;
        }
        case 'V': {
          if (commandParameters.length < 1) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i++) {
            lastPoint = {x: lastPoint.x, y: commandParameters[i]};
            subscriber.next({type:PathCommand.Type.LINE, toPoint:lastPoint});
          }
          qMirror = cMirror = lastPoint;
          return;
        }
        case 'v': {
          if (commandParameters.length < 1) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i++) {
            lastPoint = {x: lastPoint.x, y: lastPoint.y + commandParameters[i]};
            subscriber.next({type:PathCommand.Type.LINE, toPoint:lastPoint});
          }
          qMirror = cMirror = lastPoint;
          return;
        }
        case 'Q': {
          if (commandParameters.length < 4 || commandParameters.length % 4) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 4) {
            qMirror = {x: commandParameters[i], y: commandParameters[i+1]};
            lastPoint = {x: commandParameters[i+2], y: commandParameters[i+3]};
            subscriber.next({type: PathCommand.Type.QUADRATIC_CURVE, controlPoints: [qMirror], toPoint: lastPoint});
          }
          return;
        }
        case 'q': {
          if (commandParameters.length < 4 || commandParameters.length % 4) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 4) {
            qMirror = {x: lastPoint.x + commandParameters[i], y: lastPoint.y + commandParameters[i+1]};
            lastPoint = {x: lastPoint.x + commandParameters[i+2], y: lastPoint.y + commandParameters[i+3]};
            subscriber.next({type: PathCommand.Type.QUADRATIC_CURVE, controlPoints: [qMirror], toPoint: lastPoint});
          }
          return;
        }
        case 'T': {
          if (commandParameters.length < 2 || commandParameters.length % 2) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 2) {
            qMirror = {x: lastPoint.x + (lastPoint.x - qMirror.x), y: lastPoint.y + (lastPoint.y - qMirror.y)};
            lastPoint = {x: commandParameters[i], y: commandParameters[i+1]};
            subscriber.next({type: PathCommand.Type.QUADRATIC_CURVE, controlPoints: [qMirror], toPoint: lastPoint});
          }
          return;
        }
        case 't': {
          if (commandParameters.length < 2 || commandParameters.length % 2) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 2) {
            qMirror = {x: lastPoint.x + (lastPoint.x - qMirror.x), y: lastPoint.y + (lastPoint.y - qMirror.y)};
            lastPoint = {x: lastPoint.x + commandParameters[i], y: lastPoint.y + commandParameters[i+1]};
            subscriber.next({type: PathCommand.Type.QUADRATIC_CURVE, controlPoints: [qMirror], toPoint: lastPoint});
          }
          return;
        }
        case 'C': {
          if (commandParameters.length < 6 || commandParameters.length % 6) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 6) {
            const ctrlPt1 = {x: commandParameters[i], y: commandParameters[i+1]};
            cMirror = {x: commandParameters[i+2], y: commandParameters[i+3]};
            lastPoint = {x: commandParameters[i+4], y: commandParameters[i+5]};
            subscriber.next({type: PathCommand.Type.CUBIC_CURVE, controlPoints: [ctrlPt1, cMirror], toPoint: lastPoint});
          }
          return;
        }
        case 'c': {
          if (commandParameters.length < 6 || commandParameters.length % 6) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 6) {
            const ctrlPt1 = {x: lastPoint.x + commandParameters[i], y: lastPoint.y + commandParameters[i+1]};
            cMirror = {x: lastPoint.x + commandParameters[i+2], y: lastPoint.y + commandParameters[i+3]};
            lastPoint = {x: lastPoint.x + commandParameters[i+4], y: lastPoint.y + commandParameters[i+5]};
            subscriber.next({type: PathCommand.Type.CUBIC_CURVE, controlPoints: [ctrlPt1, cMirror], toPoint: lastPoint});
          }
          return;
        }
        case 'S': {
          if (commandParameters.length < 4 || commandParameters.length % 4) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 4) {
            const ctrlPt1 = {x: lastPoint.x + (lastPoint.x - cMirror.x), y: lastPoint.y + (lastPoint.y - cMirror.y)};
            cMirror = {x: commandParameters[i], y: commandParameters[i+1]};
            lastPoint = {x: commandParameters[i+2], y: commandParameters[i+3]};
            subscriber.next({type: PathCommand.Type.CUBIC_CURVE, controlPoints: [ctrlPt1, cMirror], toPoint: lastPoint});
          }
          return;
        }
        case 's': {
          if (commandParameters.length < 4 || commandParameters.length % 4) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 4) {
            const ctrlPt1 = {x: lastPoint.x + (lastPoint.x - cMirror.x), y: lastPoint.y + (lastPoint.y - cMirror.y)};
            cMirror = {x: lastPoint.x + commandParameters[i], y: lastPoint.y + commandParameters[i+1]};
            lastPoint = {x: lastPoint.x + commandParameters[i+2], y: lastPoint.y + commandParameters[i+3]};
            subscriber.next({type: PathCommand.Type.CUBIC_CURVE, controlPoints: [ctrlPt1, cMirror], toPoint: lastPoint});
          }
          return;
        }
        case 'A': {
          if (commandParameters.length < 7 || commandParameters.length % 7) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 7) {
            lastPoint = {x: commandParameters[i+5], y: commandParameters[i+6]};
            subscriber.next({
              type: PathCommand.Type.ARC,
              radiusX: commandParameters[i],
              radiusY: commandParameters[i+1],
              rotateDegrees: commandParameters[i+2],
              largeArcFlag: !!commandParameters[i+3],
              sweepFlag: !!commandParameters[i+4],
              toPoint: lastPoint,
            });
          }
          return;
        }
        case 'a': {
          if (commandParameters.length < 7 || commandParameters.length % 7) {
            subscriber.error(new Error('invalid number of parameters: ' + cmdString));
            return;
          }
          for (let i = 0; i < commandParameters.length; i += 7) {
            lastPoint = {x: lastPoint.x + commandParameters[i+5], y: lastPoint.y + commandParameters[i+6]};
            subscriber.next({
              type: PathCommand.Type.ARC,
              radiusX: commandParameters[i],
              radiusY: commandParameters[i+1],
              rotateDegrees: commandParameters[i+2],
              largeArcFlag: !!commandParameters[i+3],
              sweepFlag: !!commandParameters[i+4],
              toPoint: lastPoint,
            });
          }
          return;
        }
        default: {
          subscriber.error(new Error('invalid command: ' + cmdString));
          return;
        }
      }
    };
    let prefix = '';
    return input.subscribe(
      str => {
        str = prefix + str;
        for (;;) {
          const match = str.match(/^\s*[a-df-z][^a-df-z]*(?=[a-df-z])/i);
          if (!match) break;
          onCompleteCommand(match[0]);
          str = str.slice(match[0].length);
        }
        prefix = str;
      },
      e => subscriber.error(e),
      () => {
        if (/\S/.test(prefix)) {
          onCompleteCommand(prefix);
        }
        subscriber.complete();
      },
    );
  });
}

function splitSubPathStrings(): OperatorFunction<string, string> {
  return input => new Observable(subscriber => {
    let str = '';
    return input.subscribe(
      chunk => {
        str += chunk;
        for (;;) {
          const match = str.match(/^\s*(\S[^zm]*)(?=m)/i);
          if (!match) {
            return;
          }
          if (match[1][0].toLowerCase() !== 'm') {
            subscriber.error(new Error('expected M or m, got '+match[1][0]));
            return;
          }
          subscriber.next(match[1]);
          str = str.slice(match[0].length);
        }
      },
      (e) => subscriber.error(e),
      () => {
        const match = str.match(/^\s*(\S[\s\S]*)$/i);
        if (match) {
          if (match[1][0].toLowerCase() !== 'm') {
            subscriber.error(new Error('expected M or m, got '+match[1][0]));
            return;
          }
          subscriber.next(match[1]);
        }
        subscriber.complete();
      },
    );
  });
}

export function fromSVGPathData(): OperatorFunction<string, SubPath> {
  return input => {
    let lastPoint = {x:0, y:0};
    return input.pipe(
      splitSubPathStrings(),
      concatMap((subPathString): Observable<SubPath> => {
        const match = subPathString.match(/^\s*(m)([^a-df-z]*)([^mz]*)(z\s*)?$/i)!;
        const moveParams = match[2].trim().split(/\s*,\s*|\s+/g).map(parseFloat);
        if (moveParams.length < 2 || moveParams.length % 2) {
          throw new Error('invalid number of parameters: ' + match[1] + match[2]);
        }
        lastPoint = (
          match[1] === 'm'
          ? {x: lastPoint.x + moveParams[0], y: lastPoint.y + moveParams[1]}
          : {x:               moveParams[0], y:               moveParams[1]}
        );
        let commandStr = match[3];
        if (moveParams.length > 2) {
          commandStr = `${match[1] === 'm' ? 'l' : 'L'}${moveParams.slice(2).join(' ')} ${commandStr}`;
        }
        const closed = !!match[4];
        const startPoint = lastPoint;
        return pathCommands(startPoint, of(commandStr)).pipe(
          toArray(),
          map(commands => {
            lastPoint = commands[commands.length-1].toPoint;
            return { closed, startPoint, commands };
          }),
        )
      }),
    );
  };
}

export namespace PackedSubPath {
  export interface Buffer {
    data: ArrayLike<number>;
    offset: number;
    stride: number;
  }
}

export interface PackedSubPath extends SubPath<PathCommand.Line | PathCommand.CubicCurve> {
  xBuffer: PackedSubPath.Buffer;
  yBuffer: PackedSubPath.Buffer;
  indexBuffer: PackedSubPath.Buffer;
}

export function invertSubPaths(): OperatorFunction<SubPath, SubPath> {
  return input => input.pipe(
    concatMap(subPath => from(subPath.commands).pipe(
      toArray(),
      map(commands => {
        const closed = !!subPath.closed;
        if (commands.length === 0) {
          return { startPoint: subPath.startPoint, commands, closed };
        }
        if (subPath.closed) {
          const last = commands[commands.length-1];
          if (last.toPoint.x !== subPath.startPoint.x || last.toPoint.y !== subPath.startPoint.y) {
            commands.push({
              type: PathCommand.Type.LINE,
              toPoint: subPath.startPoint,
            });
          }
        }
        commands.reverse();
        // an extra line command is appended before the loop, and removed afterwards
        commands.push({
          type: PathCommand.Type.LINE,
          toPoint: subPath.startPoint,
        });
        const startPoint = commands[0].toPoint;
        for (let i = 0; i < commands.length-1; i++) {
          const segment = commands[i];
          switch (segment.type) {
            case PathCommand.Type.LINE: {
              commands[i] = {
                type: PathCommand.Type.LINE,
                toPoint: commands[i+1].toPoint,
              };
              break;
            }
            case PathCommand.Type.CUBIC_CURVE: {
              commands[i] = {
                type: PathCommand.Type.CUBIC_CURVE,
                controlPoints: [
                  segment.controlPoints[1],
                  segment.controlPoints[0],
                ],
                toPoint: commands[i+1].toPoint,
              };
              break;
            }
            case PathCommand.Type.QUADRATIC_CURVE: {
              commands[i] = {
                type: PathCommand.Type.QUADRATIC_CURVE,
                controlPoints: segment.controlPoints,
                toPoint: commands[i+1].toPoint,
              };
              break;
            }
            case PathCommand.Type.ARC: {
              commands[i] = {
                type: PathCommand.Type.ARC,
                radiusX: segment.radiusX,
                radiusY: segment.radiusY,
                sweepFlag: !segment.sweepFlag,
                rotateDegrees: segment.rotateDegrees,
                largeArcFlag: segment.largeArcFlag,
                toPoint: commands[i+1].toPoint,
              }
              break;
            }
          }
        }
        commands.pop();
        if (subPath.closed) {
          const last = commands[commands.length-1];
          if (last.type === PathCommand.Type.LINE
              && last.toPoint.x === startPoint.x
              && last.toPoint.y === startPoint.y) {
            commands.pop();
          }
        }
        return { startPoint, commands, closed };
      }),
     ))
  );
}

export function transformPathCommandPoints(transformer: PathCommand.PointTransformer): OperatorFunction<PathCommand, PathCommand> {
  return input => input.pipe(
    map(command => {
      switch (command.type) {
        case PathCommand.Type.LINE: return {
          type: PathCommand.Type.LINE,
          toPoint: transformer.transformPoint(command.toPoint),
        };
        case PathCommand.Type.QUADRATIC_CURVE: return {
          type: PathCommand.Type.QUADRATIC_CURVE,
          controlPoints: [transformer.transformPoint(command.controlPoints[0])],
          toPoint: transformer.transformPoint(command.toPoint),
        };
        case PathCommand.Type.CUBIC_CURVE: return {
          type: PathCommand.Type.CUBIC_CURVE,
          controlPoints: [
            transformer.transformPoint(command.controlPoints[0]),
            transformer.transformPoint(command.controlPoints[1]),
          ],
          toPoint: transformer.transformPoint(command.toPoint),
        };
        case PathCommand.Type.ARC: throw new Error('unable to transform arc point-by-point');
      }
    }),
  );
}

export function transformSubPathPoints(transformer: PathCommand.PointTransformer): OperatorFunction<SubPath, SubPath> {
  const operator = transformPathCommandPoints(transformer);
  return map(subPath => ({
    startPoint: transformer.transformPoint(subPath.startPoint),
    commands: operator(from(subPath.commands)),
    closed: subPath.closed,
  }));
}

// adapted from https://github.com/colinmeinke/svg-arc-to-cubic-bezier/blob/v3.2.0/src/index.js (ISC license)
export function curvifyArcCommands(startPoint: PathCommand.Point): OperatorFunction<PathCommand, Exclude<PathCommand, PathCommand.Arc>> {
  return input => new Observable(subscriber => {
    let lastPoint = startPoint;
    return input.subscribe(
      command => {
        if (command.type !== PathCommand.Type.ARC) {
          subscriber.next(command);
          lastPoint = command.toPoint;
          return;
        }
        if (command.radiusX === 0 || command.radiusY === 0) {
          lastPoint = command.toPoint;
          subscriber.next({type: PathCommand.Type.LINE, toPoint: lastPoint});
          return;
        }
        const sinphi = Math.sin(command.rotateDegrees * Math.PI / 180);
        const cosphi = Math.cos(command.rotateDegrees * Math.PI / 360);
        const pxp =  cosphi * (lastPoint.x - command.toPoint.x) / 2 + sinphi * (lastPoint.y - command.toPoint.y) / 2;
        const pyp = -sinphi * (lastPoint.x - command.toPoint.y) / 2 + cosphi * (lastPoint.y - command.toPoint.y) / 2;      
        if (pxp === 0 && pyp === 0) {
          lastPoint = command.toPoint;
          subscriber.next({type: PathCommand.Type.LINE, toPoint: lastPoint});
          return;
        }
        let rx = Math.abs(command.radiusX);
        let ry = Math.abs(command.radiusY);
        const lambda = (pxp*pxp) / (rx*rx) + (pyp*pyp) / (ry*ry);
        if (lambda > 1) {
          const lsqrt = Math.sqrt(lambda);
          rx *= lsqrt;
          ry *= lsqrt;
        }
        let centerX: number, centerY: number, ang1: number, ang2: number;
        {
          const rxsq  = rx*rx;
          const rysq  = ry*ry;
          const pxpsq = pxp*pxp;
          const pypsq = pyp*pyp;
        
          let radicant = (rxsq * rysq) - (rxsq * pypsq) - (rysq * pxpsq);
        
          if (radicant < 0) radicant = 0;
        
          radicant /= (rxsq * pypsq) + (rysq * pxpsq);
          radicant = Math.sqrt(radicant) * (!!command.largeArcFlag === !!command.sweepFlag ? -1 : 1);
        
          const centerxp = radicant *  rx / ry * pyp;
          const centeryp = radicant * -ry / rx * pxp;
        
          centerX = cosphi * centerxp - sinphi * centeryp + (lastPoint.x + command.toPoint.x) / 2;
          centerY = sinphi * centerxp + cosphi * centeryp + (lastPoint.y + command.toPoint.y) / 2;
        
          const vx1 = ( pxp - centerxp) / rx;
          const vy1 = ( pyp - centeryp) / ry;
          const vx2 = (-pxp - centerxp) / rx;
          const vy2 = (-pyp - centeryp) / ry;
      
          {
            const sign = (vy1 < 0 ? -1 : 1);
            const dot = vx1;
            ang1 = sign * Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot);
          }
          {
            const sign = ((vx1*vy2 - vy1*vx2) < 0) ? -1 : 1;
            const dot = vx1*vx2 + vy1*vy2;
            ang2 = sign * Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot);
            if (!command.sweepFlag) {
              if (ang2 > 0) ang2 -= Math.PI * 2;
              if (ang2 < 0) ang2 += Math.PI * 2;
            }
          }
        }

        // If 'ang2' == 90.0000000001, then `ratio` will evaluate to
        // 1.0000000001. This causes `segments` to be greater than one, which is an
        // unecessary split, and adds extra points to the bezier curve. To alleviate
        // this issue, we round to 1.0 when the ratio is close to 1.0.
        let ratio = Math.abs(ang2) / (Math.PI / 2);
        if (Math.abs(1 - ratio) < 1e-7) ratio = 1;

        const segments = Math.max(Math.ceil(ratio), 1);

        ang2 /= segments;

        const getPoint = (x: number, y: number) => ({
          x: centerX + cosphi*x*rx - sinphi*y*ry,
          y: centerY + sinphi*x*rx + cosphi*y*ry,
        });

        for (let i = 0; i < segments; i++) {
          // If 90 degree circular arc, use a constant
          // as derived from http://spencermortensen.com/articles/bezier-circle
          const a = (ang2 ===  1.5707963267948966) ?  0.551915024494
                  : (ang2 === -1.5707963267948966) ? -0.551915024494
                  : (4 / 3) * Math.tan(ang2 / 4);
      
          const x1 = Math.cos(ang1);
          const y1 = Math.sin(ang1);
          const x2 = Math.cos(ang1 + ang2);
          const y2 = Math.sin(ang1 + ang2);

          subscriber.next({
            type: PathCommand.Type.CUBIC_CURVE,
            controlPoints: [
              getPoint(x1 - y1*a, y1 + x1*a),
              getPoint(x2 + y2*a, y2 - x2*a),
            ],
            toPoint: getPoint(x2, y2),
          });

          ang1 += ang2;
        }

        lastPoint = command.toPoint;
      },
      e => subscriber.error(e),
      () => subscriber.complete(),
    )
  });
}

export function curvifySubPaths(): OperatorFunction<SubPath, SubPath<Exclude<PathCommand, PathCommand.Arc>>> {
  return map(subPath => ({
    startPoint: subPath.startPoint,
    commands: from(subPath.commands).pipe( curvifyArcCommands(subPath.startPoint) ),
    closed: subPath.closed,
  }));
}

const CIRCLE_APPROX_FACTOR = 0.551915024494;
const ONE_MINUS_CAF = 1-CIRCLE_APPROX_FACTOR;

interface RectByDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RectByCorners {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type AxisRadius = number | string | [number | string, number | string];

const ALWAYS_ZERO = () => [0, 0] as const;

const createAxisRadiusCalculator = (r: AxisRadius): ((width: number, height: number) => readonly [number, number]) => {
  if (typeof r === 'number') return r === 0 ? ALWAYS_ZERO : () => [r, r] as const;
  if (typeof r === 'string') {
    const factor = +r.slice(0, -1) / 100;
    if (isNaN(factor) || r.slice(-1) !== '%') throw new Error('expecting percentage, got ' + r);
    return (width, height) => [width * factor, height * factor] as const;
  }
  const [x, y] = r;
  if (typeof x === 'number') {
    if (typeof y === 'number') {
      return () => [x, y] as const;
    }
    const yFactor = +y.slice(0, -1) / 100;
    if (isNaN(yFactor) || y.slice(-1) !== '%') throw new Error('expecting percentage, got ' + y);
    return (_, height) => [x, height * yFactor] as const;
  }
  else if (typeof y === 'number') {
    const xFactor = +x.slice(0, -1) / 100;
    if (isNaN(xFactor) || x.slice(-1) !== '%') throw new Error('expecting percentage, got ' + y);
    return (width) => [width * xFactor, y] as const;
  }
  else {
    const xFactor = +x.slice(0, -1) / 100;
    if (isNaN(xFactor) || x.slice(-1) !== '%') throw new Error('expecting percentage, got ' + y);
    const yFactor = +y.slice(0, -1) / 100;
    if (isNaN(yFactor) || y.slice(-1) !== '%') throw new Error('expecting percentage, got ' + y);
    console.log(x, y, xFactor, yFactor);
    return (width, height) => [width * xFactor, height * yFactor] as const;
  }
};

interface RectCorners {
  topLeftRadius?: AxisRadius;
  topRightRadius?: AxisRadius;
  bottomLeftRadius?: AxisRadius;
  bottomRightRadius?: AxisRadius;
  leftRadius?: AxisRadius;
  rightRadius?: AxisRadius;
  topRadius?: AxisRadius;
  bottomRadius?: AxisRadius;
  xRadius?: AxisRadius;
  yRadius?: AxisRadius;
  radius?: AxisRadius;
}

export type RectInit = (RectByDimensions | RectByCorners) & RectCorners;

export function rectangle(init: RectInit): SubPath {
  let x1, y1, x2, y2;
  if ('width' in init) {
    x1 = init.x;
    x2 = x1 + init.width;
    y1 = init.y;
    y2 = y1 + init.height;
  }
  else {
    ({ x1, y1, x2, y2 } = init);
  }
  if (x2 < x1) [ x1, x2 ] = [ x2, x1 ];
  if (y2 < y1) [ y1, y2 ] = [ y2, y1 ];
  const width = x2 - x1;
  const height = y2 - y1;
  const [topLeftX, topLeftY] = createAxisRadiusCalculator(
    init.topLeftRadius ?? init.leftRadius ?? init.topRadius ?? init.radius ?? 0
  )(width, height);
  const [topRightX, topRightY] = createAxisRadiusCalculator(
    init.topRightRadius ?? init.rightRadius ?? init.topRadius ?? init.radius ?? 0
  )(width, height);
  const [bottomLeftX, bottomLeftY] = createAxisRadiusCalculator(
    init.bottomLeftRadius ?? init.leftRadius ?? init.bottomRadius ?? init.radius ?? 0
  )(width, height);
  const [bottomRightX, bottomRightY] = createAxisRadiusCalculator(
    init.bottomRightRadius ?? init.rightRadius ?? init.bottomRadius ?? init.radius ?? 0
  )(width, height);
  const startPoint = {x:x1, y:y1 + topLeftY};
  const commands = new Array<PathCommand>();
  const closed = true;
  if (topLeftX*topLeftY) {
    commands.push({
      type: PathCommand.Type.CUBIC_CURVE,
      controlPoints: [{x: x1, y:y1 + ONE_MINUS_CAF * topLeftY}, {x: x1 + ONE_MINUS_CAF * topLeftX, y:y1}],
      toPoint: {x:x1 + topLeftX, y:y1},
    });
  }
  commands.push({type:PathCommand.Type.LINE, toPoint:{x:x2 - topRightX, y:y1}});
  if (topRightX * topRightY) {
    commands.push({
      type: PathCommand.Type.CUBIC_CURVE,
      controlPoints: [{x: x2 - ONE_MINUS_CAF * topRightX, y:y1}, {x: x2, y:y1 + ONE_MINUS_CAF * topRightY}],
      toPoint: {x:x2, y:y1 + topRightY},
    });
  }
  commands.push({type:PathCommand.Type.LINE, toPoint:{x:x2, y:y2 - bottomRightY}});
  if (bottomRightX * bottomRightY) {
    commands.push({
      type: PathCommand.Type.CUBIC_CURVE,
      controlPoints: [{x: x2, y:y2 - ONE_MINUS_CAF * bottomRightY}, {x: x2 - ONE_MINUS_CAF * bottomRightX, y:y2}],
      toPoint: {x:x2 - bottomRightX, y:y2},
    });
  }
  commands.push({type:PathCommand.Type.LINE, toPoint:{x:x1 + bottomLeftX, y:y2}});
  if (bottomLeftX * bottomLeftY) {
    commands.push({
      type: PathCommand.Type.CUBIC_CURVE,
      controlPoints: [{x: x1 + ONE_MINUS_CAF * bottomLeftX, y:y2}, {x: x1, y:y2 - ONE_MINUS_CAF * bottomLeftY}],
      toPoint: {x:x1, y:y2 - bottomLeftY},
    });
  }
  return {startPoint, commands, closed};
}

type OvalByRadius = {centerX: number, centerY: number} & (
  {radius: number} | {radiusX: number, radiusY: number}
);
export type OvalInit = RectByDimensions | OvalByRadius;

export function oval(init: OvalInit): SubPath {
  let x1, y1, x2, y2, radiusX, radiusY;
  if ('centerX' in init) {
    if ('radiusX' in init) {
      ({radiusX, radiusY} = init);
    }
    else {
      radiusX = radiusY = init.radius;
    }
    radiusX = radiusX < 0 ? -radiusX : radiusX;
    radiusY = radiusY < 0 ? -radiusY : radiusY;
    x1 = init.centerX - radiusX;
    x2 = init.centerX + radiusX;
    y1 = init.centerY - radiusY;
    y2 = init.centerY + radiusY;
  }
  else {
    x1 = init.x;
    x2 = x1 + init.width;
    y1 = init.y;
    y2 = y1 + init.height;
    if (x2 < x1) [x2, x1] = [x1, x2];
    if (y2 < y1) [y2, y1] = [y1, y2];
    radiusX = (x2 - x1)/2;
    radiusY = (y2 - y1)/2;
  }
  return {
    startPoint: {
      x: x1 + radiusX,
      y: y1,
    },
    commands: [
      {
        type: PathCommand.Type.CUBIC_CURVE,
        controlPoints: [
          {x:x2 - ONE_MINUS_CAF*radiusX, y:y1},
          {x:x2, y:y1 + ONE_MINUS_CAF*radiusY},
        ],
        toPoint: {x:x2, y:y1 + radiusY},
      },
      {
        type: PathCommand.Type.CUBIC_CURVE,
        controlPoints: [
          {x:x2, y:y2 - ONE_MINUS_CAF*radiusY},
          {x:x2 - ONE_MINUS_CAF*radiusX, y:y2},
        ],
        toPoint: {x:x2 - radiusX, y:y2},
      },
      {
        type: PathCommand.Type.CUBIC_CURVE,
        controlPoints: [
          {x:x1 + ONE_MINUS_CAF*radiusX, y:y2},
          {x:x1, y:y2 - ONE_MINUS_CAF*radiusY},
        ],
        toPoint: {x:x1, y:y2 - radiusY},
      },
      {
        type: PathCommand.Type.CUBIC_CURVE,
        controlPoints: [
          {x:x1, y:y1 + ONE_MINUS_CAF*radiusY},
          {x:x1 + ONE_MINUS_CAF*radiusX, y:y1},
        ],
        toPoint: {x:x1 + radiusX, y:y1},
      },
    ],
    closed: true,
  };
}
