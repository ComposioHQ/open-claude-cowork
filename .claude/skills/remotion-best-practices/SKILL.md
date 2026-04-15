---
description: Use this skill when the user asks about creating videos with React, Remotion framework, programmatic video generation, video animations, or needs help with Remotion projects
---

# Remotion Best Practices

You are an expert in Remotion, the React framework for creating videos programmatically. Help users build video projects following best practices.

## Core Concepts

### The Fundamentals

Remotion gives you a **frame number** and a **blank canvas**. You render anything you want using React components, but instead of rendering UI to a browser, Remotion renders frames to a canvas.

### Key Hooks

**useCurrentFrame()**

- Returns an integer identifying the current frame being viewed
- Use this to animate properties, states, and styles
- Example: `const frame = useCurrentFrame();`

**interpolate()**

- Helper function that maps values to another range using concise syntax
- Makes animations more readable
- Example: `interpolate(frame, [0, 100], [0, 1])`

## Getting Started

### Create New Project

```bash
# Requires Node.js 16+ or Bun 1.0.3+
npx create-video@latest
```

### Start the Studio

```bash
npm start
```

The studio will open on port 3000 with a visual editor for your compositions.

## Best Practices

### 1. Component Architecture

- **Use React components** to define parts of your video (text, images, animations, scenes)
- Write React code just like for a web app
- Keep compositions modular and reusable
- Separate logic from presentation

### 2. Player Component Optimization

⚠️ **Critical**: The `<Player>` should NOT be re-rendered every time updates occur.

**Do this:**

```jsx
// Render controls and UI as siblings to the Player
// Pass a ref to the player as a prop
function VideoApp() {
  const playerRef = useRef(null);

  return (
    <>
      <Player ref={playerRef} component={MyComp} />
      <Controls playerRef={playerRef} />
    </>
  );
}
```

**Don't do this:**

```jsx
// ❌ Avoid re-rendering Player on every state change
function VideoApp() {
  const [currentFrame, setCurrentFrame] = useState(0);
  return <Player component={MyComp} frame={currentFrame} />;
}
```

### 3. Dynamic Loading with lazyComponent

When using `lazyComponent`, wrap it in `useCallback()` to avoid constant re-rendering:

```jsx
const MyLazyComponent = useCallback(() => {
  return lazyComponent(() => import('./MyComponent'));
}, []);
```

### 4. Animation Patterns

**Basic Frame-based Animation:**

```jsx
import { useCurrentFrame, interpolate } from 'remotion';

export const MyComponent = () => {
  const frame = useCurrentFrame();

  // Fade in over 30 frames
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return <div style={{ opacity }}>Hello World</div>;
};
```

**Position Animation:**

```jsx
const translateY = interpolate(
  frame,
  [0, 60],
  [100, 0],
  { extrapolateRight: 'clamp' }
);

return (
  <div style={{ transform: `translateY(${translateY}px)` }}>
    Sliding text
  </div>
);
```

### 5. Working with External APIs

- Fetch data during rendering using React hooks
- Use environment variables for API keys
- Handle loading states appropriately
- Cache responses when possible

### 6. Performance Optimization

- Use `delayRender()` and `continueRender()` for async operations
- Optimize heavy computations
- Preload assets when possible
- Use `staticFile()` for local assets

## Common Patterns

### Composition Structure

```jsx
import { Composition } from 'remotion';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="MyVideo"
        component={MyVideo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
```

### Sequence and Series

```jsx
import { Sequence, Series } from 'remotion';

// Show components in parallel at different times
<Sequence from={0} durationInFrames={60}>
  <Scene1 />
</Sequence>
<Sequence from={30} durationInFrames={60}>
  <Scene2 />
</Sequence>

// Show components one after another
<Series>
  <Series.Sequence durationInFrames={60}>
    <Scene1 />
  </Series.Sequence>
  <Series.Sequence durationInFrames={60}>
    <Scene2 />
  </Series.Sequence>
</Series>
```

## Troubleshooting

### Studio won't start

- Check Node.js version (16+ required)
- Clear node_modules and reinstall
- Check port 3000 isn't already in use

### Animations not smooth

- Ensure you're using `interpolate()` correctly
- Check frame rate (fps) setting
- Use `extrapolateRight: 'clamp'` to prevent values from going beyond range

### Player performance issues

- Don't re-render Player unnecessarily (see best practices above)
- Use refs instead of state for player controls
- Optimize heavy components inside compositions

## Licensing Note

Remotion has a special license. For commercial use, you may need to obtain a company license. Check the official documentation for details.

## Resources

- Official Docs: <https://www.remotion.dev/docs/>
- GitHub: <https://github.com/remotion-dev/remotion>
- Discord Community: Join for support and examples

## When to Use This Skill

- User asks about creating videos with code
- User mentions Remotion or programmatic video generation
- User needs help with video animations in React
- User wants to build video rendering features
- User asks about frame-based animations
