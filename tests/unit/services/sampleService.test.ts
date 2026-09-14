describe('sampleService', () => {
  it('should calculate the sum correctly following AAA pattern', () => {
    // Arrange
    const a = 10;
    const b = 25;

    // Act
    const result = a + b;

    // Assert
    expect(result).toBe(35);
  });
});
