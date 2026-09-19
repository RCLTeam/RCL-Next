import ahri from '../assets/art/ahri.jpg';
import camille from '../assets/art/camille.jpg';
import jhin from '../assets/art/jhin.jpg';
import leeSin from '../assets/art/lee-sin.jpg';
import thresh from '../assets/art/thresh.jpg';
import ascend from '../assets/brand/ascend.png';
import premier from '../assets/brand/premier.png';
import rclLogo from '../assets/brand/rcl-logo.png';
import rebellion from '../assets/brand/rebellion.webp';

export const brandAssets: Record<string, string> = { rclLogo, rebellion, premier, ascend };
export const championArt: Record<string, string> = {
  camille,
  ahri,
  thresh,
  'lee-sin': leeSin,
  jhin
};
