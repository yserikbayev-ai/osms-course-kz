import React from 'react';
import {Composition} from 'remotion';
import {OsmsLesson} from './OsmsLesson';
import {totalSec} from './beats';
import {FPS, H, W} from './theme';
import type {LessonProps} from './types';
import defaultLesson from '../props/L1.2.json';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="OsmsLesson"
      component={OsmsLesson}
      fps={FPS}
      width={W}
      height={H}
      durationInFrames={30 * FPS}
      defaultProps={defaultLesson as LessonProps}
      calculateMetadata={({props}) => ({durationInFrames: Math.ceil(totalSec(props) * FPS)})}
    />
  );
};
