import * as ImagePicker from "expo-image-picker";
import React from "react";
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function Page() {
  const [photoUri, setPhotoUri] = React.useState<string | null>(null);

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow gallery access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const submit = () => {
    if (!photoUri) {
      Alert.alert("No photo", "Please take a photo first.");
      return;
    }
    Alert.alert("Submitted", "Photo submitted successfully!");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.placeholderTitle}>Placeholder Title</Text>

      <Text style={styles.title}>Photo Capture</Text>

      <View style={styles.card}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.image} />
        ) : (
          <Text style={styles.placeholder}>No photo yet</Text>
        )}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={takePhoto}>
        <Text style={styles.buttonText}>Take Photo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primaryButton} onPress={pickFromGallery}>
        <Text style={styles.buttonText}>Pick from Gallery</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryButton, !photoUri && styles.disabled]}
        onPress={submit}
        disabled={!photoUri}
      >
        <Text style={styles.secondaryText}>Submit</Text>
      </TouchableOpacity>

      {/* Read-only description */}
      <Text style={styles.descriptionText}>
        Take a or insert a picture of your injury to accurately stage it and be provided with treatment advice!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#070914",
    alignItems: "center",
    padding: 20,
  },

  placeholderTitle: {
    position: "absolute",
    top: 20,
    left: 20,
    color: "#C4B5FD",
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.8,
  },

  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  card: {
    width: "100%",
    maxWidth: 340,
    height: 320,
    backgroundColor: "#0F1220",
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: "#8B5CF6",
  },

  placeholder: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  image: {
    width: "100%",
    height: "100%",
    borderRadius: 16,
  },

  primaryButton: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#1F1642",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#8B5CF6",
  },

  secondaryButton: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#0F1220",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3B2A5E",
    marginBottom: 12,
  },

  disabled: {
    opacity: 0.4,
  },

  buttonText: {
    color: "#C4B5FD",
    fontSize: 15,
    fontWeight: "600",
  },

  secondaryText: {
    color: "#9CA3AF",
    fontSize: 15,
    fontWeight: "500",
  },

  descriptionText: {
    width: "100%",
    maxWidth: 340,
    minHeight: 60,
    backgroundColor: "#0F1220",
    color: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#8B5CF6",
    padding: 12,
    textAlignVertical: "top",
    marginTop: 12,
    fontSize: 14,
  },
});