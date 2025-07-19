import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    // Optionally log error
  }
  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container} accessible accessibilityRole="alert" accessibilityLabel="An error occurred">
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.message}>{this.state.error?.message || 'An unexpected error occurred.'}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry} accessibilityRole="button" accessibilityLabel="Retry">
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12, color: '#db342b' },
  message: { fontSize: 16, color: '#333', marginBottom: 24, textAlign: 'center' },
  button: { backgroundColor: '#19C37D', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
}); 