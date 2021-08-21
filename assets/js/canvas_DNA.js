function DNA_plot(DNA_ID) {
  const {
    Zdog: { Illustration, TAU, Shape },
  } = window
  const MARGIN = 8
  const SPAN = 12
  const STRAND_STROKE = 2
  const BALL_PADDING = 5
  const BALL_DIAMETER = 5
  const STRANDS = 23
  const STRAND = 'silver'
  const COLORS = [
    'rgb(164, 3, 111)',
    'rgb(4, 139, 168)',
    'rgb(22, 219, 147)',
    'rgb(239, 234, 90)',
  ]
  const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]
  const YSTART = -(((STRANDS - 1) * MARGIN) / 2)

  const Scene = new Illustration({
    element: DNA_ID,
    dragRotate: true,
  })

  const Strand = new Shape({
    stroke: STRAND_STROKE,
    color: STRAND,
    path: [
      {
        x: -SPAN,
      },
      {
        x: SPAN,
      },
    ],
  })
  const Ball = new Shape({
    color: randomColor(),
    stroke: BALL_DIAMETER * 2,
    translate: {
      x: -(BALL_DIAMETER + SPAN + BALL_PADDING),
    },
  })

  new Array(STRANDS).fill().map((s, i) => {
    const strand = Strand.copy({
      addTo: Scene,
      rotate: {
        y: (TAU / STRANDS) * i,
      },
      translate: {
        y: YSTART + i * MARGIN,
      },
    })
    Ball.copy({
      addTo: strand,
      color: randomColor(),
    })
    Ball.copy({
      addTo: strand,
      color: randomColor(),
      translate: {
        x: BALL_DIAMETER + SPAN + BALL_PADDING,
      },
    })
  })

  const update = () => {
    Scene.rotate.y -= 0.03
    Scene.updateRenderGraph()
    requestAnimationFrame(update)
  }

  update()
}

DNA_plot("#canvas_DNA_left")
DNA_plot("#canvas_DNA_right")
