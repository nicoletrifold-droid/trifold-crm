import type { FC } from "react"
import { Composition } from "remotion"
import { HelloWorld } from "./HelloWorld"

/** Registro das composições (cada <Composition> é um vídeo disponível no Studio). */
export const RemotionRoot: FC = () => {
  return (
    <Composition
      id="HelloWorld"
      component={HelloWorld}
      durationInFrames={150}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{ titulo: "Trifold CRM" }}
    />
  )
}
