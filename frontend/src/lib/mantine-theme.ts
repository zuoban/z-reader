import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

const terracotta: MantineColorsTuple = [
  '#fcf2ed',
  '#f6e0d5',
  '#edb69f',
  '#e4a186',
  '#d4886c',
  '#be6d50',
  '#a5563e',
  '#8e4934',
  '#743925',
  '#592b1e',
];

// Use plain component extension objects instead of `Component.extend(...)`
// so root layout does not eagerly bundle Modal/Drawer/Select/Menu on every route.
export const mantineTheme = createTheme({
  primaryColor: 'terracotta',
  primaryShade: { light: 7, dark: 3 },
  autoContrast: true,
  luminanceThreshold: 0.35,
  respectReducedMotion: true,
  colors: {
    terracotta,
  },
  fontFamily: 'var(--font-sans)',
  fontFamilyMonospace: 'var(--font-mono)',
  headings: {
    fontFamily: 'var(--font-heading)',
    fontWeight: '500',
  },
  defaultRadius: 'md',
  components: {
    ModalRoot: {
      defaultProps: {
        centered: true,
        radius: 'lg',
        padding: 0,
        zIndex: 80,
        transitionProps: {
          duration: 160,
          exitDuration: 0,
          transition: 'fade',
        },
      },
    },
    ModalOverlay: {
      defaultProps: {
        backgroundOpacity: 0.42,
        blur: 3,
      },
    },
    DrawerRoot: {
      defaultProps: {
        padding: 0,
        zIndex: 90,
        transitionProps: {
          duration: 180,
          exitDuration: 0,
        },
      },
    },
    DrawerOverlay: {
      defaultProps: {
        backgroundOpacity: 0.42,
        blur: 3,
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
      },
    },
    ActionIcon: {
      defaultProps: {
        radius: 'md',
        variant: 'subtle',
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Menu: {
      defaultProps: {
        radius: 'md',
        shadow: 'md',
        zIndex: 60,
      },
    },
  },
});

export const mantineCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--mantine-font-family': 'var(--font-sans)',
    '--mantine-font-family-headings': 'var(--font-heading)',
    '--mantine-font-family-monospace': 'var(--font-mono)',
    '--mantine-color-body': 'var(--background)',
    '--mantine-color-text': 'var(--foreground)',
    '--mantine-color-dimmed': 'var(--muted-foreground)',
    '--mantine-color-placeholder': 'var(--muted-foreground)',
    '--mantine-color-default': 'var(--card)',
    '--mantine-color-default-hover': 'var(--secondary)',
    '--mantine-color-default-color': 'var(--foreground)',
    '--mantine-color-default-border': 'var(--border)',
  },
  light: {},
  dark: {},
});
