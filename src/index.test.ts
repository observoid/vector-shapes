
import { TestHarness } from 'zora';
import { of, from, Observable, ObservableInput } from 'rxjs';
import { toArray, reduce } from 'rxjs/operators';
import { fromSVGPathData, PathCommand, SubPath, toSVGPathData } from '../lib/index';

async function subPathsToArray(subPaths: Observable<SubPath>): Promise<SubPath[]> {
  const subPathArray = await subPaths.pipe( toArray() ).toPromise();
  return Promise.all(subPathArray.map(async subPath => ({
    closed: subPath.closed,
    startPoint: subPath.startPoint,
    commands: await from(subPath.commands).pipe( toArray() ).toPromise(),
  })));
}

function normalizeSVGPathData(d: string) {
  return d.replace(/\s*([a-df-z])\s*/gi, ' $1').replace(/\s*,\s*/g, ' ').trim();
}

export default (t: TestHarness) => {

  t.test('fromSVGPathData', async t => {

    const result = await subPathsToArray(
      of('M0,0 L100,100')
      .pipe(
        fromSVGPathData(),
      )
    );

    t.eq(result, [
      {
        startPoint: {x:0, y:0},
        commands: [
          {type:PathCommand.Type.LINE, toPoint:{x:100,y:100}}
        ],
        closed: false,
      },
    ]);

  });

  t.test('toSVGPathData', async t => {

    const subPaths: ObservableInput<SubPath> = [
      {
        startPoint: {x:50, y:25},
        closed: true,
        commands: [
          {type: PathCommand.Type.LINE, toPoint: {x: 100, y: 10}},
        ],
      },
      {
        startPoint: {x:150, y:25},
        closed: false,
        commands: [
          {type: PathCommand.Type.QUADRATIC_CURVE, controlPoints: [{x:155, y:50}], toPoint: {x:200, y:45}},
          {type: PathCommand.Type.CUBIC_CURVE, controlPoints: [{x:205, y:40}, {x:210, y:35}], toPoint: {x:220, y:0}},
        ],
      },
      {
        startPoint: {x:250, y:25},
        commands: [
          {type: PathCommand.Type.ARC, radiusX: 100, radiusY: 100, rotateDegrees: 0, toPoint: {x:300, y:250}},
        ],
      },
    ];

    const result = await from(subPaths).pipe(
      toSVGPathData(),
      reduce((all, str) => all + str, '')
    ).toPromise();

    t.eq(normalizeSVGPathData(result), 'M50 25 L100 10 Z M150 25 Q155 50 200 45 C205 40 210 35 220 0 M250 25 A100 100 0 0 0 300 250');

  });

}
