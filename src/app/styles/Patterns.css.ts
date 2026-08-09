import { style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';

export const BackgroundDotPattern = style({
  backgroundImage: `radial-gradient(${color.Background.ContainerActive} ${toRem(2)}, ${
    color.Background.Container
  } ${toRem(2)})`,
  backgroundSize: `${toRem(40)} ${toRem(40)}`,
});

export const BackgroundKennel = style({
  backgroundImage: `linear-gradient(rgba(0, 0, 0, .2), rgba(0, 0, 0, .2)), url(https://sso.kennel.rest/api/application-images/background)`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
});
