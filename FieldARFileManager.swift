// FILE: FieldARFileManager.swift
//
// Purpose: Production-ready file manager for FieldAR
// - Stores machines under: <AppDocuments>/FieldAR/Machines/<machineID>/
// - Each machine folder contains: base_photo.png, overlays.json, overlay_images/
// - Safe atomic writes, JSON Codable, error handling, async/await API
//
// Notes:
// - Requires iOS 15+ for async/await. If you target older iOS versions,
//   you can wrap these functions with completion handlers or DispatchQueues.

import Foundation
import UIKit

// MARK: - Models (matches the JSON format specified)

public struct FieldAROverlay: Codable, Equatable {
    public var id: String // UUID string
    public var imageName: String
    public var position: NormalizedPoint // 0..1
    public var size: NormalizedSize // 0..1 relative
    public var rotation: Double
    public var layerIndex: Int
}

public struct NormalizedPoint: Codable, Equatable {
    public var x: Double
    public var y: Double
}

public struct NormalizedSize: Codable, Equatable {
    public var width: Double
    public var height: Double
}

public struct FieldARDocument: Codable {
    public var machine_id: String
    public var base_image: String
    public var last_modified: String // ISO8601
    public var overlays: [FieldAROverlay]
    public var undo_history: [String] // reserved (stringified actions or snapshots)
    public var redo_history: [String]
    
    public init(machine_id: String,
                base_image: String = "base_photo.png",
                last_modified: String = ISO8601DateFormatter().string(from: Date()),
                overlays: [FieldAROverlay] = [],
                undo_history: [String] = [],
                redo_history: [String] = []) {
        self.machine_id = machine_id
        self.base_image = base_image
        self.last_modified = last_modified
        self.overlays = overlays
        self.undo_history = undo_history
        self.redo_history = redo_history
    }
}

// MARK: - Errors

public enum FieldARFileError: Error {
    case documentsDirectoryNotFound
    case machineNotFound(machineID: String)
    case fileNotFound(path: String)
    case decodeError(Error)
    case encodeError(Error)
    case ioError(Error)
    case invalidImageData
    case unknown
}

// MARK: - File Manager

public final class FieldARFileManager {
    public static let shared = FieldARFileManager()
    private let fileManager = FileManager.default
    private let baseFolderName = "FieldAR"
    private let machinesFolderName = "Machines"
    private let overlayImagesFolderName = "overlay_images"
    private let overlaysFilename = "overlays.json"
    private let baseImageName = "base_photo.png"
    
    private init() {}
    
    // MARK: - Directory helpers
    
    /// Returns the app documents directory URL
    private func documentsDirectory() throws -> URL {
        guard let url = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            throw FieldARFileError.documentsDirectoryNotFound
        }
        return url
    }
    
    /// Root FieldAR folder: <Documents>/FieldAR
    public func rootFolderURL() throws -> URL {
        return try documentsDirectory().appendingPathComponent(baseFolderName, isDirectory: true)
    }
    
    /// Machines folder: <Documents>/FieldAR/Machines
    public func machinesFolderURL() throws -> URL {
        return try rootFolderURL().appendingPathComponent(machinesFolderName, isDirectory: true)
    }
    
    /// Machine folder: <Documents>/FieldAR/Machines/<machineID>
    public func machineFolderURL(machineID: String) throws -> URL {
        return try machinesFolderURL().appendingPathComponent(machineID, isDirectory: true)
    }
    
    /// Overlay images folder for machine
    public func overlayImagesFolderURL(machineID: String) throws -> URL {
        return try machineFolderURL(machineID: machineID).appendingPathComponent(overlayImagesFolderName, isDirectory: true)
    }
    
    // MARK: - Create / Ensure folders
    
    public func ensureBaseFoldersExist() throws {
        let root = try rootFolderURL()
        let machines = try machinesFolderURL()
        try createFolderIfNeeded(root)
        try createFolderIfNeeded(machines)
    }
    
    private func createFolderIfNeeded(_ url: URL) throws {
        var isDir: ObjCBool = false
        if fileManager.fileExists(atPath: url.path, isDirectory: &isDir) {
            if isDir.boolValue { return } // OK
            // path exists but not a directory -> error attempt remove and create
            try fileManager.removeItem(at: url)
        }
        try fileManager.createDirectory(at: url, withIntermediateDirectories: true, attributes: nil)
    }
    
    // MARK: - Machine operations
    
    /// Create a new machine folder and optionally write base image data (PNG/JPEG)
    public func createMachine(machineID: String, baseImageData: Data? = nil) async throws {
        try ensureBaseFoldersExist()
        let machineURL = try machineFolderURL(machineID: machineID)
        try createFolderIfNeeded(machineURL)
        // overlay_images folder
        let overlayImagesURL = try overlayImagesFolderURL(machineID: machineID)
        try createFolderIfNeeded(overlayImagesURL)
        
        // write base image if provided
        if let data = baseImageData {
            let baseImageURL = machineURL.appendingPathComponent(baseImageName)
            try atomicWrite(data: data, to: baseImageURL)
        }
        
        // create default overlays.json if not exists
        let overlaysURL = machineURL.appendingPathComponent(overlaysFilename)
        if !fileManager.fileExists(atPath: overlaysURL.path) {
            let doc = FieldARDocument(machine_id: machineID, base_image: baseImageName)
            try saveDocument(doc, to: overlaysURL)
        }
    }
    
    /// Delete a machine folder (and everything inside). Use carefully.
    public func deleteMachine(machineID: String) async throws {
        let machineURL = try machineFolderURL(machineID: machineID)
        guard fileManager.fileExists(atPath: machineURL.path) else {
            throw FieldARFileError.machineNotFound(machineID: machineID)
        }
        do {
            try fileManager.removeItem(at: machineURL)
        } catch {
            throw FieldARFileError.ioError(error)
        }
    }
    
    /// List available machine IDs
    public func listMachines() async throws -> [String] {
        let machinesURL = try machinesFolderURL()
        do {
            let items = try fileManager.contentsOfDirectory(at: machinesURL, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
            return items.filter { $0.hasDirectoryPath }.map { $0.lastPathComponent }
        } catch {
            // if folder doesn't exist yet return empty (but ensureBaseFoldersExist usually called)
            if (error as NSError).code == NSFileNoSuchFileError { return [] }
            throw FieldARFileError.ioError(error)
        }
    }
    
    // MARK: - Document load/save
    
    /// Load overlays.json for a machine
    public func loadDocument(machineID: String) async throws -> FieldARDocument {
        let machineURL = try machineFolderURL(machineID: machineID)
        let overlaysURL = machineURL.appendingPathComponent(overlaysFilename)
        guard fileManager.fileExists(atPath: overlaysURL.path) else {
            throw FieldARFileError.fileNotFound(path: overlaysURL.path)
        }
        do {
            let data = try Data(contentsOf: overlaysURL)
            let decoder = JSONDecoder()
            let doc = try decoder.decode(FieldARDocument.self, from: data)
            return doc
        } catch let dec as DecodingError {
            throw FieldARFileError.decodeError(dec)
        } catch {
            throw FieldARFileError.ioError(error)
        }
    }
    
    /// Save overlays.json for a machine (atomic)
    public func saveDocument(_ doc: FieldARDocument, machineID: String) async throws {
        let machineURL = try machineFolderURL(machineID: machineID)
        let overlaysURL = machineURL.appendingPathComponent(overlaysFilename)
        try saveDocument(doc, to: overlaysURL)
    }
    
    private func saveDocument(_ doc: FieldARDocument, to url: URL) throws {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(doc)
            try atomicWrite(data: data, to: url)
        } catch let enc as EncodingError {
            throw FieldARFileError.encodeError(enc)
        } catch {
            throw FieldARFileError.ioError(error)
        }
    }
    
    // MARK: - Overlay images management
    
    /// Save an overlay image (PNG or JPEG). Returns the saved filename.
    /// - imageData: PNG or JPEG data
    /// - suggestedName: optional name like "bolt.png"; if nil a UUID will be used
    public func saveOverlayImage(machineID: String, imageData: Data, suggestedName: String? = nil) async throws -> String {
        let imagesFolder = try overlayImagesFolderURL(machineID: machineID)
        try createFolderIfNeeded(imagesFolder)
        
        let ext = (suggestedName as NSString?)?.pathExtension.lowercased() ?? (imageData.isPNG ? "png" : "jpg")
        let nameBase = (suggestedName as NSString?)?.deletingPathExtension ?? UUID().uuidString
        var filename = "\(nameBase).\(ext)"
        var fileURL = imagesFolder.appendingPathComponent(filename)
        var counter = 1
        while fileManager.fileExists(atPath: fileURL.path) {
            filename = "\(nameBase)-\(counter).\(ext)"
            fileURL = imagesFolder.appendingPathComponent(filename)
            counter += 1
        }
        try atomicWrite(data: imageData, to: fileURL)
        return filename
    }
    
    /// List overlay image filenames for a machine
    public func listOverlayImages(machineID: String) async throws -> [String] {
        let imagesFolder = try overlayImagesFolderURL(machineID: machineID)
        guard fileManager.fileExists(atPath: imagesFolder.path) else { return [] }
        let items = try fileManager.contentsOfDirectory(at: imagesFolder, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
        return items.filter { !$0.hasDirectoryPath }.map { $0.lastPathComponent }
    }
    
    /// Load overlay image data
    public func loadOverlayImageData(machineID: String, imageName: String) async throws -> Data {
        let imagesFolder = try overlayImagesFolderURL(machineID: machineID)
        let fileURL = imagesFolder.appendingPathComponent(imageName)
        guard fileManager.fileExists(atPath: fileURL.path) else {
            throw FieldARFileError.fileNotFound(path: fileURL.path)
        }
        do {
            return try Data(contentsOf: fileURL)
        } catch {
            throw FieldARFileError.ioError(error)
        }
    }
    
    /// Delete overlay image
    public func deleteOverlayImage(machineID: String, imageName: String) async throws {
        let imagesFolder = try overlayImagesFolderURL(machineID: machineID)
        let fileURL = imagesFolder.appendingPathComponent(imageName)
        guard fileManager.fileExists(atPath: fileURL.path) else { return }
        do {
            try fileManager.removeItem(at: fileURL)
        } catch {
            throw FieldARFileError.ioError(error)
        }
    }
    
    // MARK: - Base image helpers
    
    /// Load base image data for a machine
    public func loadBaseImageData(machineID: String) async throws -> Data {
        let machineURL = try machineFolderURL(machineID: machineID)
        let baseURL = machineURL.appendingPathComponent(baseImageName)
        guard fileManager.fileExists(atPath: baseURL.path) else {
            throw FieldARFileError.fileNotFound(path: baseURL.path)
        }
        do {
            return try Data(contentsOf: baseURL)
        } catch {
            throw FieldARFileError.ioError(error)
        }
    }
    
    /// Save base image (PNG/JPEG data)
    public func saveBaseImage(machineID: String, imageData: Data) async throws {
        let machineURL = try machineFolderURL(machineID: machineID)
        try createFolderIfNeeded(machineURL)
        let baseURL = machineURL.appendingPathComponent(baseImageName)
        try atomicWrite(data: imageData, to: baseURL)
    }
    
    // MARK: - Export / Import machine (zip-lite)
    // Simple export: write the overlays.json + base image + overlay_images files into a folder at `destinationURL`
    public func exportMachine(machineID: String, destinationURL: URL) async throws {
        let machineURL = try machineFolderURL(machineID: machineID)
        guard fileManager.fileExists(atPath: machineURL.path) else { throw FieldARFileError.machineNotFound(machineID: machineID) }
        // Copy recursively to destinationURL/<machineID>
        let dest = destinationURL.appendingPathComponent(machineID, isDirectory: true)
        if fileManager.fileExists(atPath: dest.path) {
            try fileManager.removeItem(at: dest)
        }
        try fileManager.copyItem(at: machineURL, to: dest)
    }
    
    public func importMachine(from folderURL: URL) async throws {
        // expects folderURL to be a folder containing machine folder(s) or a single machine folder
        // If folderURL content is multiple machines, copy them into Machines/
        let destMachines = try machinesFolderURL()
        try createFolderIfNeeded(destMachines)
        
        let items = try fileManager.contentsOfDirectory(at: folderURL, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
        // If folderURL is a machine folder (contains overlays.json), copy it directly
        if items.contains(where: { $0.lastPathComponent == overlaysFilename }) {
            let machineID = folderURL.lastPathComponent
            let dest = destMachines.appendingPathComponent(machineID, isDirectory: true)
            if fileManager.fileExists(atPath: dest.path) {
                try fileManager.removeItem(at: dest)
            }
            try fileManager.copyItem(at: folderURL, to: dest)
            return
        }
        // Otherwise copy each subfolder
        for item in items {
            let dest = destMachines.appendingPathComponent(item.lastPathComponent, isDirectory: item.hasDirectoryPath)
            if fileManager.fileExists(atPath: dest.path) {
                try fileManager.removeItem(at: dest)
            }
            try fileManager.copyItem(at: item, to: dest)
        }
    }
    
    // MARK: - Utilities
    
    /// Atomic write with safe replacement using temporary file
    private func atomicWrite(data: Data, to url: URL) throws {
        let tmpURL = url.appendingPathExtension("tmp-\(UUID().uuidString)")
        do {
            try data.write(to: tmpURL, options: .atomic)
            // Move into place (replace if exists)
            if fileManager.fileExists(atPath: url.path) {
                try fileManager.replaceItemAt(url, withItemAt: tmpURL)
            } else {
                try fileManager.moveItem(at: tmpURL, to: url)
            }
        } catch {
            // Clean up tmp if exists
            try? fileManager.removeItem(at: tmpURL)
            throw FieldARFileError.ioError(error)
        }
    }
}

// MARK: - Convenience: detect PNG
fileprivate extension Data {
    var isPNG: Bool {
        return self.count >= 8 && self.prefix(8) == Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    }
}