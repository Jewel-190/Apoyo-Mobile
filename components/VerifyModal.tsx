import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const TEAL = "#0B8F8B";
const TEXT_DARK = "#2B2B2B";
const TEXT_MUTED = "#7B7B7B";
const FONT = "SF Pro Rounded";

const WARNING_PNG = require("../assets/images/warning.png");
const ROUTE_VERIFY = "/Home/Verify-acc";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function VerifyModal({ visible, onClose }: Props) {
  const router = useRouter();

  return (
    <Modal transparent visible={visible} animationType="fade">
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.verifyCard} onPress={() => {}}>
          <Image
            source={WARNING_PNG}
            style={styles.warningImg}
            resizeMode="contain"
          />
          <Text style={styles.verifyTitle}>Verify your account.</Text>
          <Text style={styles.verifySub}>
            Please verify your account to gain access.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.verifyBtn,
              pressed && { opacity: 0.92 },
            ]}
            onPress={() => {
              onClose();
              router.push(ROUTE_VERIFY as any);
            }}
          >
            <Text style={styles.verifyBtnText}>Verify</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && { opacity: 0.92 },
            ]}
            onPress={onClose}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  verifyCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
  },
  warningImg: {
    width: 70,
    height: 70,
    marginBottom: 10,
  },
  verifyTitle: {
    fontSize: 20,
    fontFamily: FONT,
    fontWeight: "700",
    color: TEXT_DARK,
  },
  verifySub: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: FONT,
    fontWeight: "600",
    color: TEXT_MUTED,
    textAlign: "center",
  },
  verifyBtn: {
    marginTop: 16,
    width: "100%",
    height: 48,
    borderRadius: 24,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyBtnText: {
    color: "#FFFFFF",
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
  },
  cancelBtn: {
    marginTop: 10,
    width: "100%",
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDEDED",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: TEXT_DARK,
    fontFamily: FONT,
    fontWeight: "700",
    fontSize: 15,
  },
});
