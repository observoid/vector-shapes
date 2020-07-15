
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
      of(`
        M0,0
        L100,100
        l50,25
        H50
        h-10
        V30
        v10
        Q 65,75 90,110
        q 30,30 55,65
        T 200,300
        t 500,700
        C 450,625 275,300 100,150
        c 35,45 65,85 150,175
        S 500,700 1000,1500
        s 1000,2000 5000,2500
      `)
      .pipe(
        fromSVGPathData(),
      )
    );

    t.eq(result, [
      {
        startPoint: {x:0, y:0},
        commands: [
          {type:PathCommand.Type.LINE, toPoint:{x:100,y:100}},
          {type:PathCommand.Type.LINE, toPoint:{x:150,y:125}},
          {type:PathCommand.Type.LINE, toPoint:{x:50,y:125}},
          {type:PathCommand.Type.LINE, toPoint:{x:40,y:125}},
          {type:PathCommand.Type.LINE, toPoint:{x:40,y:30}},
          {type:PathCommand.Type.LINE, toPoint:{x:40,y:40}},
          {type:PathCommand.Type.QUADRATIC_CURVE, controlPoints:[{x:65, y:75}], toPoint:{x:90, y:110}},
          {type:PathCommand.Type.QUADRATIC_CURVE, controlPoints:[{x:120, y:140}], toPoint:{x:145, y:175}},
          {type:PathCommand.Type.QUADRATIC_CURVE, controlPoints:[{x:170, y:210}], toPoint:{x:200, y:300}},
          {type:PathCommand.Type.QUADRATIC_CURVE, controlPoints:[{x:230, y:390}], toPoint:{x:700, y:1000}},
          {type:PathCommand.Type.CUBIC_CURVE, controlPoints:[{x:450, y:625}, {x:275, y:300}], toPoint:{x:100, y:150}},
          {type:PathCommand.Type.CUBIC_CURVE, controlPoints:[{x:135, y:195}, {x:165, y:235}], toPoint:{x:250, y:325}},
          {type:PathCommand.Type.CUBIC_CURVE, controlPoints:[{x:335, y:415}, {x:500, y:700}], toPoint:{x:1000, y:1500}},
          {type:PathCommand.Type.CUBIC_CURVE, controlPoints:[{x:1500, y:2300}, {x:2000, y:3500}], toPoint:{x:6000, y:4000}},
        ],
        closed: false,
      },
    ]);

    const testInvalidParameters = (command: string) => {
      t.test(`${command} command parameter validation`, async t => {
        let thrown: any = undefined;
        let result: PathCommand[] | undefined = undefined;
        try {
          const pathData = `M0,0 ${command}${/[hv]/i.test(command) ? '' : '1'}`;
          const subPath = await of(pathData).pipe( fromSVGPathData() ).toPromise();
          result = await from(subPath.commands).pipe( toArray() ).toPromise();
        }
        catch (e) {
          thrown = e;
        }
        t.eq(result, undefined);
        t.notEq(thrown, undefined);
      });
    };

    testInvalidParameters('L');
    testInvalidParameters('l');
    testInvalidParameters('H');
    testInvalidParameters('h');
    testInvalidParameters('V');
    testInvalidParameters('v');
    testInvalidParameters('Q');
    testInvalidParameters('q');
    testInvalidParameters('T');
    testInvalidParameters('t');
    testInvalidParameters('C');
    testInvalidParameters('c');
    testInvalidParameters('S');
    testInvalidParameters('s');

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
