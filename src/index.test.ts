
import { TestHarness } from 'zora';
import { of, from, Observable } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { fromSVGPathData, PathCommand, SubPath } from '../lib/index';

async function subPathsToArray(subPaths: Observable<SubPath>): Promise<SubPath[]> {
  const subPathArray = await subPaths.pipe( toArray() ).toPromise();
  return Promise.all(subPathArray.map(async subPath => ({
    closed: subPath.closed,
    startPoint: subPath.startPoint,
    commands: await from(subPath.commands).pipe( toArray() ).toPromise(),
  })));
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

}
