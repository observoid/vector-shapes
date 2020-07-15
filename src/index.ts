
import { Observable, OperatorFunction, of, ObservableInput, from } from 'rxjs';
import { map, concatAll } from 'rxjs/operators';

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

export function fromSVGPathData(): OperatorFunction<string, SubPath> {
  return input => new Observable(subscriber => {
    let prefix = '';
    let lastPoint = {x:0, y:0};
    const onCompleteSubPath = (str: string) => {
      const match = str.match(/^\s*(m)([^a-df-z]*)([^mz]*)(z\s*)?$/i);
      if (!match) {
        subscriber.error(new Error('invalid command'));
        return;
      }
      const moveParams = match[2].trim().split(/\s*,\s*|\s+/g).map(parseFloat);
      if (moveParams.length < 2 || moveParams.length % 2) {
        subscriber.error(new Error('invalid number of parameters: ' + match[1] + match[2]));
        return;
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
      subscriber.next({
        closed: !!match[4],
        startPoint: lastPoint,
        commands: pathCommands(lastPoint, of(commandStr)),
      });
    };
    return input.subscribe(
      str => {
        str = prefix + str;
        for (;;) {
          const match = str.match(/^\s*m[^a-df-z]*[^mz]*(?:z|(?=m))/i);
          if (!match) break;
          onCompleteSubPath(match[0]);
          str = str.slice(match[0].length);
        }
        prefix = str;
      },
      e => subscriber.error(e),
      () => {
        prefix = prefix.trim();
        if (prefix !== '') {
          onCompleteSubPath(prefix);
        }
        subscriber.complete();
      },
    );
  });
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
