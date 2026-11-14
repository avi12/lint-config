namespace Fixture;

internal static class Program
{
  private static int Main()
  {
    return 0;
  }
}

public sealed class Documented // flag: CS1591
{
}

public struct Cold
{
  public static readonly int Value2;

  static Cold() // flag: CA2207
  {
    Value2 = 2;
  }
}
